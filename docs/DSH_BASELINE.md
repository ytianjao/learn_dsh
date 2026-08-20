# DSH 基线 / DSH baseline

## 固定版本 / Pinned version

- DSH release / DSH 版本：`0.1.0-rc.8`
- Baseline commit / 基线提交：`141eb6fef83422698aef7a981029e843e8161534`
- Node：`22.19.0`（上游范围 / upstream range：`^22.19.0 || >=24.0.0`）
- pnpm：`11.7.0`

云端通道将 `@deepseek-ai/dsh` 精确固定为 dev dependency。Web profile 通过 `dsh web --dump-default-config` 初始化，当前 checkout 通过 `dsh plugin --profile web add <checkout>` 安装，服务通过 `dsh web --host 127.0.0.1 --port 3080 --trusted-host <authority> --no-open` 启动。

The cloud lane pins `@deepseek-ai/dsh` as an exact dev dependency. It initializes the Web profile with `dsh web --dump-default-config`, installs the current checkout with `dsh plugin --profile web add <checkout>`, and starts it with `dsh web --host 127.0.0.1 --port 3080 --trusted-host <authority> --no-open`.

LearnLoop 只依赖公开 Host seams：Cordis Context、Storage Domain 与 Host Web Server；Client 通过 DSH Web slots 注册视图、输入 dock 和设置。

LearnLoop depends only on public Host seams: Cordis Context, Storage Domain, and Host Web Server. The Client registers views, an input dock, and settings through DSH Web slots.

## 所有权 / Ownership

DSH 拥有会话、消息、模型配置、凭据和流式响应。LearnLoop 拥有学习状态和同源投影，不复制凭据或模型路由。

DSH owns sessions, messages, model configuration, credentials, and streaming responses. LearnLoop owns learning state and its same-origin projection, without duplicating credentials or model routing.

## 升级规则 / Upgrade rule

更改 DSH 基线前，必须重新运行构建、兼容性测试、HTTP/领域测试和真实 Web fixture 验收。Client Module 格式仍为 prerelease 风险边界。

Before changing the DSH baseline, rerun build, compatibility, HTTP/domain tests, and acceptance against a real Web fixture. The Client Module format remains a prerelease risk boundary.
