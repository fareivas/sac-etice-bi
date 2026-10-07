#!/usr/bin/env python3
"""Controle local da VPN SAC-ETICE. Requer Python 3 e AWS CLI v2.

status/check apenas consultam AWS. off exclui a conexão; on recria.
O pfSense precisa receber os novos endpoints após on.
Os arquivos privados permanecem fora de qualquer repositório.
"""
import argparse
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

PROFILE = 'sac-etice-bi'
REGION = 'us-east-1'
ORIGINAL = 'vpn-0cd81923e926437cc'
CGW = 'cgw-02752a54f1cb76b44'
VGW = 'vgw-0f979630e29ecc431'
DEFAULT_BACKUP = '/home/fabio/sac-etice-vpn-backup-l0rlaX5A'


class Failure(Exception):
    pass


class AwsFailure(Failure):
    def __init__(self, operation, code):
        self.code = code
        super().__init__(f'AWS {operation}: {code}. Nenhum segredo foi exibido.')


def aws(operation, *args):
    cmd = ['aws', 'ec2', operation, *args, '--profile', PROFILE,
           '--region', REGION, '--no-cli-pager', '--output', 'json']
    env = dict(os.environ, AWS_CLI_AUTO_PROMPT='off', AWS_PAGER='')
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode:
        match = re.search(r'An error occurred \(([^)]+)\)', result.stderr)
        code = match.group(1) if match else f'falha CLI (código {result.returncode})'
        raise AwsFailure(operation, code)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def save(path, data, raw=False):
    fd, temp = tempfile.mkstemp(prefix='.tmp-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(data if raw else json.dumps(data, indent=2))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read(path):
    with path.open() as src:
        return json.load(src)


def check_target(vpn):
    if vpn.get('CustomerGatewayId') != CGW or vpn.get('VpnGatewayId') != VGW:
        raise Failure('Gateways diferentes dos autorizados; operação bloqueada.')
    if vpn.get('Type') != 'ipsec.1' or not vpn.get('Options', {}).get('StaticRoutesOnly'):
        raise Failure('Este controle exige a VPN IPsec com rotas estáticas.')
    if vpn.get('Options', {}).get('EnableAcceleration'):
        raise Failure('Aceleração inesperada; operação bloqueada.')


def current(vpn_id):
    try:
        entries = aws('describe-vpn-connections', '--vpn-connection-ids', vpn_id)['VpnConnections']
    except AwsFailure as exc:
        if exc.code in ('InvalidVpnConnectionID.NotFound', 'InvalidVpnConnectionId.NotFound'):
            return None
        raise
    if not entries:
        return None
    vpn = entries[0]
    check_target(vpn)
    return vpn


def project(value, schema):
    """Usa o schema de criação da CLI instalada para excluir campos de resposta."""
    if isinstance(value, dict) and isinstance(schema, dict):
        return {k: project(v, schema[k]) for k, v in value.items()
                if k in schema and v is not None and v != ''}
    if isinstance(value, list) and isinstance(schema, list):
        return [project(v, schema[0]) for v in value] if schema else []
    return copy.deepcopy(value)


def make_plan(vpn):
    check_target(vpn)
    schema = aws('create-vpn-connection', '--generate-cli-skeleton', 'input')
    opts = project(vpn['Options'], schema['Options'])
    # Obtém PSKs do XML local caso não estejam nas opções retornadas.
    root = ET.fromstring(vpn.get('CustomerGatewayConfiguration', ''))
    by_ip = {}
    for tunnel in root.findall('.//ipsec_tunnel'):
        ip = tunnel.findtext('vpn_gateway/tunnel_outside_address/ip_address')
        by_ip[ip] = tunnel.findtext('ike/pre_shared_key')
    originals = vpn['Options'].get('TunnelOptions', [])
    tunnels = opts.get('TunnelOptions', [])
    if len(tunnels) != 2:
        raise Failure('Não foi possível preservar os dois túneis; operação bloqueada.')
    for old, new in zip(originals, tunnels):
        key = new.get('PreSharedKey') or by_ip.get(old.get('OutsideIpAddress'))
        if not key or not re.fullmatch(r'[A-Za-z1-9_.][A-Za-z0-9_.]{7,63}', key):
            raise Failure('PSK ausente ou incompatível com a recriação; operação bloqueada.')
        if not new.get('TunnelInsideCidr'):
            raise Failure('CIDR interno ausente; operação bloqueada.')
        new['PreSharedKey'] = key
    routes = sorted({r['DestinationCidrBlock'] for r in vpn.get('Routes', [])
                     if r.get('State') != 'deleted'})
    if routes != ['10.40.0.0/22']:
        raise Failure('Rotas diferentes do inventário esperado; operação bloqueada.')
    request = {'Type': vpn['Type'], 'CustomerGatewayId': CGW,
               'VpnGatewayId': VGW, 'Options': opts}
    tags = [t for t in vpn.get('Tags', []) if not t['Key'].startswith('aws:')]
    if tags:
        request['TagSpecifications'] = [{'ResourceType': 'vpn-connection', 'Tags': tags}]
    return {'Request': request, 'Routes': routes}


def prepare(folder, vpn):
    plan = make_plan(vpn)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    save(folder / f'vpn-{stamp}.json', {'VpnConnections': [vpn]})
    save(folder / 'latest-source.json', {'VpnConnections': [vpn]})
    save(folder / 'restore-plan.json', plan)
    print('Configuração de recriação validada e salva localmente (sem exibir PSKs).')
    return plan


def show(vpn, vpn_id):
    print(f'VPN: {vpn_id}')
    if not vpn or vpn['State'] == 'deleted':
        print('Estado: excluída/ausente.')
        return
    print(f"Estado AWS: {vpn['State']}")
    for i, tunnel in enumerate(vpn.get('VgwTelemetry', []), 1):
        print(f"Túnel {i}: {tunnel.get('Status')} | IP: {tunnel.get('OutsideIpAddress')}")
    print('Rotas: ' + ', '.join(r['DestinationCidrBlock'] for r in vpn.get('Routes', [])))


def reconcile(folder, vpn_id, vpn, plan):
    if vpn['State'] == 'pending':
        print('Aguardando a VPN ficar disponível na AWS (pode levar alguns minutos)...', flush=True)
        aws('wait', 'vpn-connection-available', '--vpn-connection-ids', vpn_id)
        vpn = current(vpn_id)
    if not vpn or vpn['State'] != 'available':
        raise Failure('VPN não disponível. Execute status e repita on depois.')
    # Salva a configuração antes de qualquer restauração de rota.
    save(folder / f'{vpn_id}.json', {'VpnConnections': [vpn]})
    xml = vpn.get('CustomerGatewayConfiguration')
    if not xml:
        raise Failure('Configuração ainda indisponível. Repita on depois; não será criada outra VPN.')
    save(folder / f'{vpn_id}-config.xml', xml, raw=True)
    existing = {r['DestinationCidrBlock'] for r in vpn.get('Routes', [])
                if r.get('State') != 'deleted'}
    for route in plan['Routes']:
        if route not in existing:
            aws('create-vpn-connection-route', '--vpn-connection-id', vpn_id,
                '--destination-cidr-block', route)
    show(current(vpn_id), vpn_id)
    print(f'Configuração privada: {folder / (vpn_id + "-config.xml")}')
    print('Atualize os endpoints no pfSense. O XML é uma referência AWS, não um backup importável do pfSense.')
    print('A conexão provisionada volta a gerar cobrança mesmo com túneis DOWN.')


def run(args):
    folder = Path(args.backup).expanduser().resolve()
    if not folder.is_dir() or not (folder / 'vpn.json').is_file():
        raise Failure('Pasta de backup inválida; use --backup CAMINHO.')
    if folder.stat().st_uid != os.getuid() or folder.stat().st_mode & 0o077:
        raise Failure('A pasta deve pertencer ao seu usuário e ter permissão 700.')
    for item in folder.iterdir():
        if item.is_file() and (item.stat().st_uid != os.getuid() or item.stat().st_mode & 0o077):
            raise Failure('Há arquivo com permissões abertas na pasta de backup.')
    with (folder / '.control.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Failure('Outro comando vpn está em execução.')
        state_file = folder / 'control-state.json'
        state = read(state_file) if state_file.exists() else {'VpnId': ORIGINAL}
        vpn_id = state['VpnId']
        vpn = current(vpn_id)
        if args.action == 'status':
            show(vpn, vpn_id)
            return
        if args.action == 'check':
            source_file = folder / 'latest-source.json'
            if not source_file.exists():
                source_file = folder / 'vpn.json'
            source = vpn if vpn and vpn['State'] not in ('deleted', 'deleting') else read(source_file)['VpnConnections'][0]
            prepare(folder, source)
            show(vpn, vpn_id)
            print('Verificação concluída. Nenhum recurso AWS foi alterado.')
            return
        if args.action == 'off':
            if not vpn or vpn['State'] == 'deleted':
                print('VPN já excluída/ausente.')
                return
            if vpn['State'] != 'deleting':
                prepare(folder, vpn)
                # Guarda o ID antes de iniciar uma operação que pode ser interrompida.
                save(state_file, {'VpnId': vpn_id})
                aws('delete-vpn-connection', '--vpn-connection-id', vpn_id)
            print('Exclusão solicitada. Aguardando confirmação AWS...', flush=True)
            aws('wait', 'vpn-connection-deleted', '--vpn-connection-ids', vpn_id)
            print('VPN excluída. VPC, gateways, subnets e tabela de rotas foram preservados.')
            return
        # on: nenhuma criação enquanto o recurso conhecido ainda existe.
        if vpn and vpn['State'] == 'deleting':
            raise Failure('Exclusão em andamento. Aguarde e repita status/on.')
        if vpn and vpn['State'] in ('available', 'pending'):
            plan_file = folder / 'restore-plan.json'
            plan = read(plan_file) if plan_file.exists() else prepare(folder, vpn)
            reconcile(folder, vpn_id, vpn, plan)
            return
        others = aws('describe-vpn-connections', '--filters',
                     f'Name=customer-gateway-id,Values={CGW}',
                     f'Name=vpn-gateway-id,Values={VGW}')['VpnConnections']
        if any(v['State'] != 'deleted' for v in others):
            raise Failure('Existe outra conexão entre os mesmos gateways; criação bloqueada para evitar duplicação.')
        plan_file = folder / 'restore-plan.json'
        if not plan_file.exists():
            raise Failure('Execute check antes de on para validar o plano local.')
        plan = read(plan_file)
        request_file = folder / 'create-request.json'
        save(request_file, plan['Request'])
        print('Criando VPN. A cobrança por provisionamento será retomada...', flush=True)
        vpn = aws('create-vpn-connection', '--cli-input-json',
                  'file://' + str(request_file))['VpnConnection']
        vpn_id = vpn['VpnConnectionId']
        # Persiste imediatamente para retomada após falha no waiter ou nas rotas.
        save(state_file, {'VpnId': vpn_id})
        save(folder / f'{vpn_id}-creation.json', {'VpnConnection': vpn})
        print(f'Novo ID salvo: {vpn_id}', flush=True)
        reconcile(folder, vpn_id, vpn, plan)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'check', 'off', 'on'])
    parser.add_argument('--backup', default=DEFAULT_BACKUP)
    args = parser.parse_args()
    try:
        run(args)
    except (Failure, OSError, ValueError, KeyError, ET.ParseError) as exc:
        # Não imprime payloads, stderr bruto ou traceback que possam conter PSKs.
        if isinstance(exc, Failure):
            print(str(exc), file=sys.stderr)
        else:
            print(f'Falha local ({type(exc).__name__}). Confira a instalação e os backups; nenhum segredo foi exibido.', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Interrompido. Execute status antes de repetir a operação.', file=sys.stderr)
        return 130
    return 0


if __name__ == '__main__':
    sys.exit(main())
