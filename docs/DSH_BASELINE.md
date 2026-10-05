# DSH 基线 / DSH baseline

## 固定版本 / Pinned version

- DSH release / DSH 版本：`0.2.1-alpha.1`（源码检出跟随最新版 / tracked at the linked source checkout）
- Baseline commit / 基线提交：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`
- Node：`^22.19.0 || >=24`

LearnLoop 只依赖公开 Host seams：Cordis Context、Storage Domain 与 Host Web Server；Client 通过 DSH Web slots 注册视图、输入 dock 和设置。

LearnLoop depends only on public Host seams: Cordis Context, Storage Domain, and Host Web Server. The Client registers views, an input dock, and settings through DSH Web slots.

## 所有权 / Ownership

DSH 拥有会话、消息、模型配置、凭据和流式响应。LearnLoop 拥有学习状态和同源投影，不复制凭据或模型路由。

DSH owns sessions, messages, model configuration, credentials, and streaming responses. LearnLoop owns learning state and its same-origin projection, without duplicating credentials or model routing.

## 升级规则 / Upgrade rule

更改 DSH 基线前，必须重新运行构建、兼容性测试、HTTP/领域测试和真实 Web fixture 验收。Client Module 格式仍为 prerelease 风险边界。

Before changing the DSH baseline, rerun build, compatibility, HTTP/domain tests, and acceptance against a real Web fixture. The Client Module format remains a prerelease risk boundary.
