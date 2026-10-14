#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/local-api-test.XXXXXXXX")"
trap 'rm -rf -- "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/scripts" "$TEST_DIR/infra/sam" "$TEST_DIR/bin"
cp "$(dirname "$0")/../local-api.sh" "$TEST_DIR/scripts/local-api.sh"
touch "$TEST_DIR/.env.local" "$TEST_DIR/infra/sam/template.yaml"

cat > "$TEST_DIR/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == -e ]]; then exit 0; fi
printf '{}' > "$2"
EOF
cat > "$TEST_DIR/bin/docker" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$TEST_DIR/bin/sam" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == build ]]; then exit 0; fi
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[i]}" == --env-vars ]]; then
    env_file="${args[i + 1]}"
    [[ -f "$env_file" && "$(stat -c '%a' "$env_file")" == 600 ]] || {
      printf 'Arquivo temporário ausente ou sem permissões 0600.\n' >&2
      exit 1
    }
    break
  fi
done
printf '%s\n' "$@" > "$SAM_TEST_ARGS"
EOF
chmod +x "$TEST_DIR/bin/"*

for mode in LAZY EAGER NONE; do
  args_file="$TEST_DIR/args-$mode"
  if [[ "$mode" == LAZY ]]; then
    env -u SAM_WARM_CONTAINERS PATH="$TEST_DIR/bin:$PATH" SAM_TEST_ARGS="$args_file" \
      bash "$TEST_DIR/scripts/local-api.sh"
  else
    PATH="$TEST_DIR/bin:$PATH" SAM_TEST_ARGS="$args_file" SAM_WARM_CONTAINERS="$mode" \
      bash "$TEST_DIR/scripts/local-api.sh"
  fi
  if [[ "$mode" == NONE ]]; then
    ! grep -q '^--warm-containers$' "$args_file"
  else
    grep -A1 '^--warm-containers$' "$args_file" | grep -qx "$mode"
  fi
  env_file="$(sed -n '/^--env-vars$/{n;p;}' "$args_file")"
  [[ ! -e "$env_file" ]] || { printf 'Arquivo temporário não foi removido.\n' >&2; exit 1; }
done

for invalid in INVALID ''; do
  if PATH="$TEST_DIR/bin:$PATH" SAM_TEST_ARGS="$TEST_DIR/invalid-args" \
    SAM_WARM_CONTAINERS="$invalid" bash "$TEST_DIR/scripts/local-api.sh" \
    >"$TEST_DIR/invalid-out" 2>"$TEST_DIR/invalid-err"; then
    printf 'Valor inválido foi aceito.\n' >&2
    exit 1
  fi
  grep -q 'Use LAZY, EAGER ou NONE' "$TEST_DIR/invalid-err"
  [[ ! -e "$TEST_DIR/invalid-args" ]]
done
printf 'Modos LAZY, EAGER e NONE, validação e limpeza: PASS\n'
