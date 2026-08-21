# 产品契约 / Product contract

## 产品边界 / Product boundary

DSH 负责会话、流式 Chat、模型路由和凭据；LearnLoop 负责学习项目、计划、证据、掌握度、复盘和调整事实。LearnLoop 不实现模型提供商客户端。

DSH owns sessions, streaming Chat, model routing, and credentials. LearnLoop owns learning projects, plans, evidence, mastery, review, and adjustment facts. LearnLoop does not implement a model-provider client.

## 浏览器体验 / Browser experience

DSH Chat 保持默认输入面。LearnLoop 提供首次使用面板、当前任务、计划、进度、复盘和设置。所有 LearnLoop 网页文案可在简体中文与 English 间切换，选择持久化在 Host settings 中。

DSH Chat remains the default input surface. LearnLoop adds onboarding, current task, Plan, Progress, Review, and Settings. All LearnLoop web copy switches between Simplified Chinese and English, with the selection persisted in Host settings.

空状态、加载失败、连接失败和冲突必须显示可操作反馈。当前 v1 明确使用确定性的 Agent 工程初始模板，不把模板描述成语义生成结果。

Empty, waiting-for-model, loading, disconnected, and conflict states must offer actionable feedback. Only a validated learnloop_publish_plan call creates the authoritative plan.

## 学习规则 / Learning rules

用户解释、伪代码、实现、假设、评测或反思只有在包含来源范围和幂等键时才可作为证据。模型解释、“懂了”、停留时间或完成按钮本身不是证据。

A learner explanation, pseudocode, implementation, hypothesis, assessment, or reflection qualifies as evidence only with a source range and idempotency key. Model explanations, “I understand,” time on page, and the completion button alone are not evidence.

概念进入计划后为 introduced；一条证据为 practicing；两条高置信证据为 demonstrated；三条高置信证据且包含 assessment 或 implementation 才是 mastered。任务完成与掌握度相互独立。

A concept in the plan is introduced; one evidence item means practicing; two high-confidence items mean demonstrated; mastery requires three high-confidence items including an assessment or implementation. Task completion and mastery remain independent.

## 调整与一致性 / Adjustments and consistency

调整必须同时携带人类可读 diff 和可执行结构化操作。小调整可以自动应用；大调整必须批准。应用与撤销都创建新的不可变计划版本，撤销使用应用时保存的逆操作。

An adjustment must carry both a human-readable diff and executable structured operations. Minor adjustments may apply automatically; major adjustments require approval. Apply and revert both create immutable plan versions, with revert using inverse operations captured at apply time.

Host 是唯一权威状态。每个 mutation 在原子更新中检查单调 revision，并以幂等键安全处理重试。reset 不得令 revision 回退。

The Host is the sole authority. Every mutation checks a monotonic revision inside an atomic update and safely handles retries by idempotency key. Reset must never roll the revision backward.

通过当前任务界面完成任务并提交证据时，Evidence、Mastery 和 Task 状态在同一个 Host 原子更新中提交。

When a task is completed with evidence from the current-task interface, Evidence, Mastery, and Task state are committed in the same atomic Host update.

## 隐私与安全 / Privacy and security

LearnLoop 不接收模型密钥。变更接口要求同源、JSON content type、专用 mutation header、严格运行时 schema 和 128 KiB 请求上限。导出包含学习数据，用户应按敏感数据保护。

LearnLoop never receives model credentials. The mutation API requires same origin, JSON content type, a dedicated mutation header, strict runtime schemas, and a 128 KiB request limit. Exports contain learning data and should be protected as sensitive information.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_publish_plan`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_publish_plan`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.
