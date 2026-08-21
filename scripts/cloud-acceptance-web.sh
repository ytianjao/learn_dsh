#!/usr/bin/env bash
# Start private Codespaces-forwarded DSH Web. / 启动通过 Codespaces 私有转发的 DSH Web。
set -euo pipefail

: "${CODESPACE_NAME:?CODESPACE_NAME is required; run this command inside GitHub Codespaces}"
: "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is required inside GitHub Codespaces}"

export DSH_HOME="$HOME/.dsh-learnloop-acceptance"
readonly port=3080
readonly authority="${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
readonly browser_url="https://${authority}"

cat <<EOF
Starting pinned DSH Web on http://127.0.0.1:${port}.
Codespaces browser URL: ${browser_url}

Keep port ${port} PRIVATE in the Codespaces Ports panel, then open the URL above.
在 Codespaces“端口”面板中保持 ${port} 为“私有”，然后打开上述地址。
Configure a real key only in DSH Settings -> Models for an opt-in manual smoke.
真实密钥仅用于可选人工 smoke，并且只在 DSH 设置 -> 模型中输入。
Press Ctrl+C to stop DSH Web. / 按 Ctrl+C 停止 DSH Web。
EOF

if [[ -n "${DSH_BIN:-}" ]]; then
  exec node "$DSH_BIN" web --host 127.0.0.1 --port "$port" --trusted-host "$authority" --no-open
fi
exec pnpm exec dsh web --host 127.0.0.1 --port "$port" --trusted-host "$authority" --no-open
