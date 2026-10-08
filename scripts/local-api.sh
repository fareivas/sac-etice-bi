#!/usr/bin/env bash
# Do not enable shell tracing: this workflow handles local credentials.
set +x
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail() { printf 'Erro: %s\n' "$1" >&2; exit 1; }
[[ -f .env.local ]] || fail 'Crie a configuração local: cp .env.local.example .env.local'
[[ -f infra/sam/template.yaml ]] || fail 'Template infra/sam/template.yaml não encontrado.'
for tool in node docker sam; do
  command -v "$tool" >/dev/null 2>&1 || fail "Comando necessário não encontrado: $tool"
done
node -e 'if (typeof require("node:util").parseEnv !== "function") process.exit(1)' || fail 'Use Node.js 20.12 ou superior, com util.parseEnv.'
# Honor an existing Docker configuration. On Linux, use the standard socket
# when available (also works around incompatible SAM Docker context handling).
if [[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" && -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=unix:///var/run/docker.sock
fi
docker info >/dev/null 2>&1 || fail 'Daemon Docker inacessível. Inicie o Docker e confira DOCKER_HOST/DOCKER_CONTEXT.'

ENV_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sac-etice-bi-env.XXXXXXXX")"
cleanup() { rm -rf -- "$ENV_DIR"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node scripts/local-sam-env.mjs "$ENV_DIR/env.json"
# Do not pass database credentials to the build process.
PATH="$ROOT/node_modules/.bin:$PATH" sam build \
  --template-file infra/sam/template.yaml \
  --build-dir .aws-sam/build
sam local start-api \
  --template-file .aws-sam/build/template.yaml \
  --env-vars "$ENV_DIR/env.json" \
  --host 127.0.0.1 \
  --port 3000 \
  --skip-pull-image
