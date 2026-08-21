# 交付计划 / Delivery plan

| 切片 / Slice | 状态 / Status | 验证 / Verification |
| --- | --- | --- |
| 基线与加载 / Baseline and load | 完成 / Complete | compatibility + installed-profile smoke |
| 双语网页外壳 / Bilingual web shell | 完成 / Complete | Client syntax + bilingual manual/E2E acceptance |
| 项目初始化 / Project initialization | 完成 / Complete | domain + HTTP + persistence tests |
| 对话边界 / Conversation boundary | 完成 / Complete | DSH Chat remains authoritative |
| 证据与掌握度 / Evidence and mastery | 完成 / Complete | idempotency + mastery tests |
| 调整与撤销 / Adjustment and revert | 完成 / Complete | executable operation + immutable-version tests |
| 恢复与安全 / Recovery and safety | 完成 / Complete | atomic CAS, monotonic reset, strict schemas, same-origin tests |
| 打包 / Packaging | 完成，真实密钥 smoke 由用户执行 / Complete; live-key smoke is user-owned | build + pack validation |

唯一外部验收是用户在 DSH 中自行配置模型后的真实流式对话。LearnLoop 不读取或接收该凭据。

The sole external acceptance step is a live streamed conversation after the user configures a model in DSH. LearnLoop never reads or receives that credential.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_publish_plan`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_publish_plan`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## PR #16 runtime invariant
`Task N != completed => Task N+1 cannot become active`. Planning policy lives in a session-scoped DSH System Prompt; user chat carries user intent only.
