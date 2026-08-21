# 交付报告 / Delivery report

## 已交付 / Delivered

LearnLoop 是 DSH Web tree-out 包。Host 提供 schema-versioned Storage Domain 和同源状态 API；Client 提供双语 Plan、Progress、Review、onboarding/current-task dock 与设置。DSH 继续拥有流式对话、模型路由和凭据。

LearnLoop is a tree-out package for DSH Web. The Host provides a schema-versioned Storage Domain and same-origin state API; the Client provides bilingual Plan, Progress, Review, onboarding/current-task dock, and settings. DSH continues to own streaming conversation, model routing, and credentials.

写入使用 Storage Domain 原子 update、单调 revision、严格 Zod mutation schema 和幂等键。结构化计划操作可以真正更新或移动任务，应用与撤销均创建不可变版本。

Writes use the Storage Domain's atomic update, monotonic revisions, strict Zod mutation schemas, and idempotency keys. Structured plan operations actually update or move tasks, and both apply and revert create immutable versions.

## 验证 / Verification

自动门禁覆盖领域不变量、调整应用/撤销、证据与掌握度、依赖、并发冲突、reset revision、非法输入、同源限制、Client syntax、构建和包内容。浏览器验收需要真实 DSH fixture。

Automated gates cover domain invariants, adjustment apply/revert, evidence and mastery, dependencies, concurrent conflicts, reset revisions, invalid input, same-origin restrictions, Client syntax, build, and package contents. Browser acceptance requires a real DSH fixture.

## 限制 / Limitations

rc.8 Client Module 格式仍是 prerelease。计划请求通过当前 DSH Chat 和所选模型执行，LearnLoop 不读取凭据。JSON export 是审计副本，完整恢复使用 DSH Home backup。

The rc.8 Client Module format remains prerelease. Planning uses the current DSH Chat and selected model without exposing credentials to LearnLoop. JSON export is an audit copy; complete restore uses DSH Home backup.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_publish_plan`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_publish_plan`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## Runtime v2 delivery
LearnLoop now separates visible intent from Host-owned control policy, captures explicit learning modes, migrates schema v1, binds projects to DSH sessions, and gates progression through `startTask` and atomic evidence completion. Semantic model-output filtering remains a non-goal.
