import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';

// Parse data only: never source shell code or interpolate environment values.
try {
  const env = parseEnv(readFileSync('.env.local', 'utf8'));
  const required = ['SAC_DB_PORT', 'SAC_DB_NAME', 'SAC_DB_USER', 'SAC_DB_PASSWORD',
    'SAC_DB_SSL', 'LOCAL_FISCAL_USER_ID', 'LOCAL_MANAGER_USER_ID'];
  for (const key of required) {
    if (!env[key]?.trim()) throw new Error(`Variável obrigatória ausente: ${key}`);
  }
  if (!/^\d+$/.test(env.SAC_DB_PORT) || Number(env.SAC_DB_PORT) < 1 || Number(env.SAC_DB_PORT) > 65535) {
    throw new Error('SAC_DB_PORT deve ser uma porta entre 1 e 65535.');
  }
  if (!['true', 'false'].includes(env.SAC_DB_SSL)) throw new Error('SAC_DB_SSL deve ser true ou false.');
  for (const key of ['LOCAL_FISCAL_USER_ID', 'LOCAL_MANAGER_USER_ID']) {
    if (!/^[1-9]\d*$/.test(env[key]) || !Number.isSafeInteger(Number(env[key]))) {
      throw new Error(`${key} deve ser um inteiro positivo seguro.`);
    }
  }
  if (!env.SAC_DB_HOST?.trim()) {
    try {
      const networks = JSON.parse(execFileSync('docker', ['network', 'inspect', 'bridge'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      env.SAC_DB_HOST = networks[0]?.IPAM?.Config?.find(item => item.Gateway)?.Gateway;
    } catch {
      throw new Error('Não foi possível descobrir o gateway Docker. Defina SAC_DB_HOST em .env.local.');
    }
    if (!env.SAC_DB_HOST) throw new Error('Gateway Docker ausente. Defina SAC_DB_HOST em .env.local.');
  }
  const db = Object.fromEntries(['SAC_DB_HOST', 'SAC_DB_PORT', 'SAC_DB_NAME',
    'SAC_DB_USER', 'SAC_DB_PASSWORD', 'SAC_DB_SSL'].map(key => [key, env[key]]));
  writeFileSync(process.argv[2], JSON.stringify({
    FiscalFunction: { NODE_ENV: 'development', ...db,
      LOCAL_FISCAL_DASHBOARD_ENABLED: 'true', LOCAL_FISCAL_USER_ID: env.LOCAL_FISCAL_USER_ID,
      LOCAL_FISCAL_CAN_ACCESS_VIEW: 'true' },
    GerenteContratosFunction: { NODE_ENV: 'development', ...db,
      LOCAL_MANAGER_DASHBOARD_ENABLED: 'true', LOCAL_MANAGER_USER_ID: env.LOCAL_MANAGER_USER_ID,
      LOCAL_MANAGER_CAN_ACCESS_VIEW: 'true' },
  }), { mode: 0o600, flag: 'wx' });
} catch (error) {
  // Only our validation messages are safe; parser/IO errors may contain input.
  const message = error instanceof Error && /^(Variável obrigatória|SAC_DB_|LOCAL_|Não foi possível descobrir|Gateway Docker)/.test(error.message)
    ? error.message : 'Não foi possível ler .env.local ou gerar o env SAM. Confira o formato e as permissões.';
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}
