# 网页验收 / Web acceptance

The keyless browser lane runs the DSH CLI installed from npm at the range pinned in
`package.json`; it never follows `master` or contacts a real model endpoint.

## 自动验收 / Automated acceptance

1. 启动固定 DSH Web fixture 并设置 `DSH_WEB_URL` / Start the pinned DSH Web fixture and set `DSH_WEB_URL`.
2. 运行 `npm run test:e2e` / Run `npm run test:e2e`.
3. 验证首次使用、计划、刷新持久化、进度与复盘 / Verify onboarding, Plan, refresh persistence, Progress, and Review.

## 人工关键路径 / Manual critical path

- 在 Settings → LearnLoop 将语言切换到 English，确认 onboarding、导航、任务、三个视图、错误和设置均切换；再切回简体中文 / Switch to English and verify onboarding, navigation, task, all three views, errors, and settings; then switch back.
- 同时从两个页面提交 mutation，确认一个成功且另一个显示 revision conflict / Submit concurrent mutations from two pages and confirm one succeeds while the other shows a revision conflict.
- reset 后刷新并确认项目为空且旧页面 mutation 被拒绝 / Reset, refresh to an empty project, and confirm mutations from an old page are rejected.
- 导出 JSON 并确认浏览器未暴露 DSH 模型凭据 / Export JSON and confirm no DSH model credentials are exposed.

## 可选真实模型 smoke / Optional live-model smoke

用户在 DSH Settings → Models 配置自己的密钥后，发送一条教学消息并确认流式响应。LearnLoop 不读取该密钥，此步骤不属于无密钥自动化。

After the user configures a key in DSH Settings → Models, send one teaching message and verify streaming. LearnLoop never reads the key; this step is outside keyless automation.


## 产品语义 / Product semantics

运行时契约、Session 隔离、持久化边界、交互协议与审阅边界的唯一定义在 `docs/PRODUCT_CONTRACT.md`；验收按该文档执行，这里不复述。

The runtime contract, Session isolation, persistence boundary, interaction protocol, and review boundary are defined once, in `docs/PRODUCT_CONTRACT.md`; acceptance follows that document and does not restate it.

## Browser trust boundary
The web client may call only begin/cancel check for verification. It never sends confidence, message identifiers, event sequence, criterion result, or task completion. A Workspace backup uses the dedicated export endpoint, which Settings links per Workspace; every mutation carries the `x-learnloop-mutation` header (`docs/PRODUCT_CONTRACT.md`, Privacy and security).

# Keyless Web Acceptance

Since 0.1.6, DSH gates the browser client behind per-launch browser-session authentication: the orchestrator must read the `?token=` URL printed by `dsh web` and pass it to Playwright as `DSH_WEB_URL`; API routes remain reachable for readiness polling. / 自 0.1.6 起，DSH 对浏览器客户端启用了每次启动生成令牌认证的认证：编排脚本必须读取 `dsh web` 打印的 `?token=` URL 并作为 `DSH_WEB_URL` 传给 Playwright；就绪轮询使用的 API 路由不受影响。

The deterministic provider reads the latest `LEARNLOOP_STATE_V1` Host control (`requiredTools`), the latest tool result's `nextQuestion`, visible Tool names, and the learner subject, and answers in plain text outside the interview. Its log records, per request, the message count, system-message count, state-block count, and declared tools, so a regression to per-step system copies or tool toggling is visible. `MOCK_MODEL_POLICY=null` sends no token on the first question and only the token afterwards; the default enhancing policy relabels the quantitative-trading `goal.outcome` codes, adds the optional `time-budget.deadline` Probe, and assumes the practice constraints. The browser path also edits an unasked field in the review dialog and checks it survives a reload. Run the lane under both policies. Playwright must use the real custom field and real option click; no state injection or skip is permitted. Preserve `mock-provider.log`, `dsh-web.log`, `fixture-setup.log`, trace, and screenshots as CI artifacts.
