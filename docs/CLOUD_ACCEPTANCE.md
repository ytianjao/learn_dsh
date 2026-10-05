# 云端验收通道 / Cloud acceptance channel

## 固定基线 / Pinned baseline

| 项目 / Item | 固定值 / Pin |
| --- | --- |
| DeepSeek Harness | `0.2.1-alpha.1`（源码检出 / linked source checkout） |
| Upstream commit / 上游提交 | `5badb15009ae1756c3afe0ae0cef1faafc290ccc` |
| Node | `22.19.0`（DSH 支持 `^22.19.0 || >=24.0.0`） |
| pnpm | `11.7.0` |
| Plugin install / 插件安装 | `dsh plugin --profile web add <checkout>` |
| Web start / Web 启动 | `dsh web --host 127.0.0.1 --port 3080 --trusted-host <authority> --no-open` |

版本来自同一 DSH release commit 的根 `package.json` 和 CLI package。LearnLoop 将 CLI 固定为精确 dev dependency，并使用同版本 Node/pnpm 构建 Codespace 与 Actions。Web E2E 还会 checkout、构建并实际启动该固定 commit 的 CLI，而不是仅验证一个未使用的源码 checkout。

These versions come from the root `package.json` and CLI package at the same DSH release commit. LearnLoop pins the CLI as an exact dev dependency and uses the matching Node/pnpm versions in Codespaces and Actions. Web E2E also checks out, builds, and actually starts the CLI from that pinned commit rather than validating an unused source checkout.

## 从 PR 分支创建 Codespace / Create a Codespace from a PR branch

1. 打开 PR，选择 **Code → Codespaces → Create codespace on `<branch>`**。如果 GitHub UI 没有直接显示该入口，先打开 PR 的 **Files changed**，从分支下拉菜单进入仓库，再选择相同 PR head branch。
2. 等待 `.devcontainer/devcontainer.json` 完成。它启用 pnpm 11.7.0 并运行锁定依赖安装，不配置任何模型密钥。
3. 在终端确认 `node --version`、`pnpm --version` 和 `git branch --show-current`。

1. Open the PR and choose **Code → Codespaces → Create codespace on `<branch>`**. If the PR UI does not expose it directly, navigate to the repository from **Files changed**, select the PR head branch, and create the Codespace there.
2. Wait for `.devcontainer/devcontainer.json` to finish. It enables pnpm 11.7.0 and installs locked dependencies without configuring model credentials.
3. Confirm `node --version`, `pnpm --version`, and `git branch --show-current` in the terminal.

## 准备并启动 LearnLoop / Prepare and start LearnLoop

```bash
pnpm run acceptance:prepare
pnpm run acceptance:web
```

`acceptance:prepare` 使用 `$HOME/.dsh-learnloop-acceptance`，构建插件、初始化 web profile、从当前 checkout 安装插件，并在 `dump-config` 中验证 bundle。命令可重复执行且不会发出模型请求。

`acceptance:prepare` uses `$HOME/.dsh-learnloop-acceptance`, builds the plugin, initializes the web profile, installs the current checkout, and verifies the bundle in `dump-config`. It is repeatable and sends no model request.

`acceptance:web` 只绑定 `127.0.0.1:3080`，从 Codespaces 环境变量计算转发 authority，传递 `--trusted-host` 和 `--no-open`。它不会使用 `--host 0.0.0.0`，也不会读取或打印 API key。

`acceptance:web` binds only `127.0.0.1:3080`, derives the forwarded authority from Codespaces environment variables, and passes `--trusted-host` plus `--no-open`. It never uses `--host 0.0.0.0` and neither reads nor prints an API key.

## 打开私有端口 / Open the private forwarded port

1. 打开 Codespace 的 **Ports / 端口** 面板。
2. 找到端口 `3080`，确认 **Port Visibility / 端口可见性** 为 **Private / 私有**。不要切换为 Public。
3. 选择 **Open in Browser / 在浏览器中打开**，或打开启动脚本打印的 `https://<codespace>-3080.<forwarding-domain>`。
4. 若页面能打开但 API 被拒绝，确认浏览器地址的 authority 与脚本打印的值完全一致，然后重新运行 `pnpm run acceptance:web`。

1. Open the Codespace **Ports** panel.
2. Find port `3080` and confirm **Port Visibility** is **Private**. Never switch it to Public.
3. Select **Open in Browser**, or open the `https://<codespace>-3080.<forwarding-domain>` URL printed by the start script.
4. If the page loads but the API trust fence rejects it, confirm the browser authority exactly matches the printed value and restart `pnpm run acceptance:web`.

## 可选真实 DeepSeek 人工验收 / Optional live DeepSeek manual acceptance

自动 CI 只使用本机 mock provider，并在运行测试前将真实 DeepSeek API host 映射到 loopback。它不需要、读取或保存真实 key。

Automated CI uses only a local mock provider and maps real DeepSeek API hosts to loopback before testing. It does not need, read, or store a real key.

只有人工验证学习对话时，才在打开的 DSH 页面中进入 **Settings → Models / 设置 → 模型**，选择 DeepSeek provider 并粘贴自己的 key。不要把 key 写入终端、Codespaces secrets、仓库文件、issue、PR、截图或日志。该 key 由 DSH 存入隔离的验收 home，而非 LearnLoop。

Only for a manual live-conversation check, open **Settings → Models**, choose the DeepSeek provider, and paste your own key. Never put it in the terminal, Codespaces secrets, repository files, issues, PRs, screenshots, or logs. DSH stores it in the isolated acceptance home; LearnLoop never receives it.

按 `docs/ACCEPTANCE_SCENARIOS.md` 完成浏览器验收。真实 provider 调用可能产生费用，并受用户账户条款约束。

Follow `docs/ACCEPTANCE_SCENARIOS.md` for browser acceptance. A real provider call may incur cost and is subject to the user's account terms.

## 清理和停止 / Reset and stop

在 Web 终端按 `Ctrl+C`，然后清除隔离状态：

Press `Ctrl+C` in the Web terminal, then remove the isolated state:

```bash
pnpm run acceptance:reset
```

该命令只允许删除 `$HOME/.dsh-learnloop-acceptance`，避免误删普通 `$HOME/.dsh`。完成后在 GitHub **Codespaces** 页面选择当前实例的 **Stop codespace**；长期不用时选择 **Delete**，避免继续占用配额。

The command only permits removal of `$HOME/.dsh-learnloop-acceptance`, protecting the normal `$HOME/.dsh`. Afterwards, choose **Stop codespace** for the current instance on GitHub's **Codespaces** page; choose **Delete** when it is no longer needed to avoid consuming quota.
