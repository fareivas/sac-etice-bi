import pg from 'pg';

export const PREFIX = 'E2E_FISCAL_';
const EMAILS = ['E2E_FISCAL_A@example.invalid', 'E2E_FISCAL_B@example.invalid'];
const CNPJ = '99999999999991';
const CONTRACTS = [
  ['A1', 'vigente', 0], ['A2', 'vigente', 0],
  ['A3', 'suspenso', 0], ['A4', 'encerrado', 0],
  ['A5', 'rescindido', 0], ['B1', 'vigente', 1],
];

export function fixtureConfig(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Fixture recusada em production');
  if (env.ALLOW_LOCAL_DB_FIXTURES !== 'true') throw new Error('Exige ALLOW_LOCAL_DB_FIXTURES=true');
  const required = (key) => {
    const value = env[key];
    if (!value?.trim()) throw new Error(`Configuração ausente: ${key}`);
    return value;
  };
  const port = Number(required('SAC_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SAC_DB_PORT inválida');
  const ssl = env.SAC_DB_SSL ?? 'false';
  if (!['true', 'false'].includes(ssl)) throw new Error('SAC_DB_SSL inválida');
  return { host: required('SAC_DB_HOST'), port, database: required('SAC_DB_NAME'), user: required('SAC_DB_USER'), password: required('SAC_DB_PASSWORD'), ssl: ssl === 'true' };
}

async function assertOwned(client) {
  const users = await client.query('SELECT id, nome, email FROM comum.usuario WHERE email = ANY($1::text[])', [EMAILS]);
  if (users.rows.some((r) => !r.nome.startsWith(PREFIX))) throw new Error('Email E2E ocupado por usuário não identificado');
  const supplier = await client.query('SELECT id, razao_social FROM fornecedores.fornecedor WHERE cnpj=$1', [CNPJ]);
  if (supplier.rows.some((r) => !r.razao_social.startsWith(PREFIX))) throw new Error('CNPJ E2E ocupado por fornecedor não identificado');
  const contracts = await client.query('SELECT id, numero FROM contratos.contrato WHERE numero LIKE $1', [`${PREFIX}%`]);
  if (contracts.rows.some((r) => !CONTRACTS.some(([suffix]) => r.numero === `${PREFIX}${suffix}`))) throw new Error('Prefixo E2E ocupado por contrato desconhecido');
  return { users: users.rows, supplier: supplier.rows, contracts: contracts.rows };
}

async function removeOwned(client) {
  const owned = await assertOwned(client);
  const contractIds = owned.contracts.map((r) => r.id);
  const userIds = owned.users.map((r) => r.id);
  if (contractIds.length) {
    const designations = await client.query('SELECT id, usuario_id FROM contratos.designacao WHERE contrato_id = ANY($1::bigint[])', [contractIds]);
    if (designations.rows.some((r) => !userIds.includes(r.usuario_id))) throw new Error('Contrato E2E possui designação externa; cleanup recusado');
    await client.query('DELETE FROM contratos.designacao WHERE contrato_id = ANY($1::bigint[])', [contractIds]);
    await client.query('DELETE FROM contratos.contrato WHERE id = ANY($1::bigint[])', [contractIds]);
  }
  if (userIds.length) await client.query('DELETE FROM comum.usuario WHERE id = ANY($1::bigint[])', [userIds]);
  if (owned.supplier.length) await client.query('DELETE FROM fornecedores.fornecedor WHERE id=$1', [owned.supplier[0].id]);
}

export async function runFixture(action, scenario, env = process.env) {
  const config = fixtureConfig(env);
  if (action === 'setup' && !['A', 'B', 'C', 'D'].includes(scenario)) throw new Error('Cenário deve ser A, B, C ou D');
  if (!['setup', 'cleanup'].includes(action)) throw new Error('Ação inválida');
  const client = new pg.Client(config);
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('E2E_FISCAL_FIXTURE'))");
    await removeOwned(client);
    if (action === 'cleanup') {
      await client.query('COMMIT');
      return { removed: true };
    }
    const supplier = await client.query('INSERT INTO fornecedores.fornecedor (cnpj, razao_social) VALUES ($1,$2) RETURNING id', [CNPJ, `${PREFIX}FORNECEDOR`]);
    const ids = [];
    for (const [index, email] of EMAILS.entries()) {
      const result = await client.query('INSERT INTO comum.usuario (nome,email,ativo) VALUES ($1,$2,true) RETURNING id', [`${PREFIX}${index ? 'B' : 'A'}`, email]);
      ids.push(result.rows[0].id);
    }
    const count = { A: 0, B: 1, C: 5, D: 6 }[scenario];
    for (const [suffix, status, owner] of CONTRACTS.slice(0, count)) {
      const contract = await client.query('INSERT INTO contratos.contrato (numero,ano,lado,fornecedor_id,status,objeto) VALUES ($1,2026,$2,$3,$4,$5) RETURNING id', [`${PREFIX}${suffix}`, 'fornecedor', supplier.rows[0].id, status, `${PREFIX}TESTE`]);
      await client.query('INSERT INTO contratos.designacao (contrato_id,usuario_id,papel,ativo) VALUES ($1,$2,$3,true)', [contract.rows[0].id, ids[owner], 'fiscal']);
    }
    await client.query('COMMIT');
    return { scenario, fiscalA: ids[0], fiscalB: ids[1] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
