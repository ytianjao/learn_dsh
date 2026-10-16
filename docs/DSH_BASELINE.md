# DSH 基线 / DSH baseline

## 分发方式 / Distribution

- DSH 来源 / DSH source：**npm 发布版**（`npx @deepseek-ai/dsh@alpha`），硬盘上不保留源码检出
- peer 范围 / Peer ranges：`package.json` 的 `@deepseek-ai/dsh-*` 与 `@deepseek-ai/cordis`
- Node：`^22.19.0 || >=24`

LearnLoop 只依赖公开 Host seams：Cordis Context、Storage Domain 与 Host Web Server；Client 通过 DSH Web slots 注册视图、输入 dock 和设置。

LearnLoop depends only on public Host seams: Cordis Context, Storage Domain, and Host Web Server. The Client registers views, an input dock, and settings through DSH Web slots.

## 版本跟随 / Version tracking

peer 范围使用浮动区间（`^0.2.1-alpha.1`），因此在同一小版本线内升级 DSH 不需要改代码。Host 的 profile preflight 用 `evaluatePluginCompatibility` 校验插件声明的 peer；范围不匹配会让插件在启动时被禁用，也会让 `dsh plugin add` 拒绝安装。`pnpm run verify:dsh-compat` 直接调用同一个函数，因此冲突会在 CI 先暴露。

Peer ranges float (`^0.2.1-alpha.1`), so a Harness upgrade inside the minor line needs no code change. The Host's profile preflight validates declared peers with `evaluatePluginCompatibility`; a mismatched range disables the plugin at startup and makes `dsh plugin add` refuse the install. `pnpm run verify:dsh-compat` calls that same function, so a conflict surfaces in CI first.

## 所有权 / Ownership

DSH 拥有会话、消息、模型配置、凭据和流式响应。LearnLoop 拥有学习状态和同源投影，不复制凭据或模型路由。

DSH owns sessions, messages, model configuration, credentials, and streaming responses. LearnLoop owns learning state and its same-origin projection, without duplicating credentials or model routing.

## 升级规则 / Upgrade rule

更改 peer 范围前，必须重新运行构建、兼容性测试、HTTP/领域测试和真实 Web fixture 验收。跨大版本线时修改我们自己的代码去适配新 seam，而不是把版本钉回去。Client Module 格式仍为 prerelease 风险边界。

Before changing a peer range, rerun build, compatibility, HTTP/domain tests, and acceptance against a real Web fixture. When the Harness crosses a major line, adjust our own code to the new seam rather than pinning back. The Client Module format remains a prerelease risk boundary.
