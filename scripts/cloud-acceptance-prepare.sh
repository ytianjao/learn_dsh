#!/usr/bin/env bash
# Prepare an isolated, keyless DSH Web profile. / 准备隔离且无密钥的 DSH Web profile。
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DSH_HOME="$HOME/.dsh-learnloop-acceptance"
export LEARNLOOP_E2E_WORKSPACE="${RUNNER_TEMP:-/tmp}/learnloop-e2e-workspace"

run_dsh() {
  if [[ -n "${DSH_BIN:-}" ]]; then
    node "$DSH_BIN" "$@"
  else
    pnpm exec dsh "$@"
  fi
}

cd "$REPO_ROOT"
node -e "const b=require('./scripts/dsh-baseline.json'); console.log('DSH version:',b.version); console.log('DSH commit:',b.commit)"
printf 'LearnLoop commit: %s\nNode version: %s\npnpm version: %s\n' "$(git rev-parse HEAD)" "$(node --version)" "$(pnpm --version)"
pnpm run verify:dsh-baseline
printf 'Using isolated DSH_HOME: %s\n' "$DSH_HOME"
rm -rf -- "$LEARNLOOP_E2E_WORKSPACE"
mkdir -p "$LEARNLOOP_E2E_WORKSPACE"
printf '{"name":"learnloop-e2e-workspace","private":true}\n' >"$LEARNLOOP_E2E_WORKSPACE/package.json"
printf 'Created acceptance Workspace directory: %s\n' "$LEARNLOOP_E2E_WORKSPACE"
printf 'Building LearnLoop without a model request...\n'
pnpm run build

# Dumping the shipped default initializes the web profile without booting it.
# 导出内置默认配置会初始化 web profile，但不会启动服务。
run_dsh web --dump-default-config >/dev/null

# `pnpm add` is idempotent for the same absolute checkout path.
# 对同一绝对 checkout 路径重复执行 `pnpm add` 是幂等的。
run_dsh plugin --profile web add "$REPO_ROOT"

readonly dump_file="$(mktemp)"
trap 'rm -f "$dump_file"' EXIT
run_dsh web --dump-config >"$dump_file"
if ! grep -Fq "@learnloop/dsh-learnloop" "$dump_file"; then
  printf 'LearnLoop bundle was not found in the composed web profile.\n' >&2
  exit 1
fi

printf 'LearnLoop bundle verified in the web profile. No provider request was made.\n'
printf 'Next: pnpm acceptance:web\n'
