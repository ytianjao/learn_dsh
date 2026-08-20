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

rc.8 Client Module 格式仍是 prerelease。初始课程是明确标注的 Agent 工程模板；没有后台付费生成调用。JSON export 是审计副本，完整恢复使用 DSH Home backup。

The rc.8 Client Module format remains prerelease. The initial curriculum is an explicitly disclosed Agent-engineering template with no paid background generation call. JSON export is an audit copy; complete restore uses DSH Home backup.
