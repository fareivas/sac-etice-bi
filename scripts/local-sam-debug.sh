#!/usr/bin/env bash
# Do not enable shell tracing: this workflow handles local credentials.
set +x
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
case "${1:-}" in
  FiscalFunction) BUILD_DIR=.aws-sam/debug-fiscal ;;
  GerenteContratosFunction) BUILD_DIR=.aws-sam/debug-gerente ;;
  *) printf 'Erro: use FiscalFunction ou GerenteContratosFunction.\n' >&2; exit 1 ;;
esac
FUNCTION="$1"
fail() { printf 'Erro: %s\n' "$1" >&2; exit 1; }
[[ -f .env.local ]] || fail 'Crie a configuração local: cp .env.local.example .env.local'
for tool in node docker sam; do
  command -v "$tool" >/dev/null 2>&1 || fail "Comando necessário não encontrado: $tool"
done
node -e 'if (typeof require("node:util").parseEnv !== "function") process.exit(1)' || fail 'Use Node.js 20.12 ou superior, com util.parseEnv.'
if [[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" && -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=unix:///var/run/docker.sock
fi
docker info >/dev/null 2>&1 || fail 'Daemon Docker inacessível. Inicie o Docker e confira DOCKER_HOST/DOCKER_CONTEXT.'

DEBUG_TEMPLATE="infra/sam/.local-debug.$(date +%s).$$.yaml"
ENV_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sac-etice-bi-debug-env.XXXXXXXX")"
cleanup() { rm -f -- "$DEBUG_TEMPLATE"; rm -rf -- "$ENV_DIR"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node scripts/local-sam-debug-template.mjs infra/sam/template.yaml "$DEBUG_TEMPLATE" "$FUNCTION"
node scripts/local-sam-env.mjs "$ENV_DIR/env.json"
# Credentials are available only to start-api, never to sam build.
PATH="$ROOT/node_modules/.bin:$PATH" sam build "$FUNCTION" \
  --template-file "$DEBUG_TEMPLATE" \
  --build-dir "$BUILD_DIR"
node scripts/local-sam-debug-sourcemap.mjs "$BUILD_DIR/$FUNCTION" "$ROOT"
sam local start-api \
  --template-file "$BUILD_DIR/template.yaml" \
  --env-vars "$ENV_DIR/env.json" \
  --host 127.0.0.1 --port 3000 \
  --debug-port 9229 --debug-function "$FUNCTION" \
  --warm-containers LAZY --skip-pull-image
