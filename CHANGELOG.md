# 变更日志 / Changelog

## Unreleased

- 任务完成与证据提交现在通过单个原子 mutation 完成，避免部分成功和重复 revision / Task completion and evidence submission now use one atomic mutation, preventing partial success and duplicate revision increments.
- 增加固定 DSH/Node/pnpm 的 GitHub Actions 与私有 Codespaces 云端验收通道 / Added GitHub Actions and a private Codespaces acceptance lane pinned to DSH, Node, and pnpm.
- 增加隔离且可重复的 profile 准备、loopback Web 启动、验收清理脚本和完整人工场景 / Added repeatable isolated-profile preparation, loopback Web startup, reset scripts, and manual scenarios.
- 使用 Storage Domain 原子 update 修复并发丢失更新，并保持 reset revision 单调 / Fixed concurrent lost updates with atomic Storage Domain updates and monotonic reset revisions.
- 使用严格 Zod schema 校验所有 mutation、枚举、置信度和结构化操作 / Added strict Zod validation for every mutation, enum, confidence value, and structured operation.
- 计划调整现在实际应用 update/move 操作，撤销使用逆操作创建新版本 / Plan adjustments now apply update/move operations, and revert creates a new version through inverse operations.
- LearnLoop 网页可在简体中文和 English 间完整切换 / The complete LearnLoop web UI now switches between Simplified Chinese and English.
- 核心文档、用户文案和关键代码注释改为中英双语 / Made core documentation, user copy, and key code comments bilingual.

## 0.1.0

- LearnLoop Host、Web Client、领域模型、HTTP API、测试与文档的初始版本 / Initial LearnLoop Host, Web Client, domain model, HTTP API, tests, and documentation.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_publish_plan`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_publish_plan`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## Unreleased — Runtime v2
- Added explicit learning preferences, session ownership, v1 migration, dynamic System Prompt policy, preference-aware plan validation, and atomic start/complete progression gates.
- Replaced visible internal control prompts and browser `prompt()` evidence with intent-only chat messages and an inline checkpoint.

## Runtime hardening (PR #20)

A LearnLoop project is bound to exactly one DSH Session. The Host returns a server-redacted projection to foreign sessions and rejects their project mutations; this local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. Same-origin remains the HTTP write boundary and LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: `project.sessionId === mutation.sessionId`; active and blocked current tasks cannot coexist; `foreign => no project, plan, evidence, mastery, assessment, adjustment, or event content`.
