# 网页验收 / Web acceptance

## 自动验收 / Automated acceptance

1. 启动固定 DSH Web fixture 并设置 `DSH_WEB_URL` / Start the pinned DSH Web fixture and set `DSH_WEB_URL`.
2. 运行 `npm run test:e2e` / Run `npm run test:e2e`.
3. 验证首次使用、计划、刷新持久化、进度与复盘 / Verify onboarding, Plan, refresh persistence, Progress, and Review.

## 人工关键路径 / Manual critical path

- 在 Settings → LearnLoop 将语言切换到 English，确认 onboarding、导航、任务、三个视图、错误和设置均切换；再切回简体中文 / Switch to English and verify onboarding, navigation, task, all three views, errors, and settings; then switch back.
- 同时从两个页面提交 mutation，确认一个成功且另一个显示 revision conflict / Submit concurrent mutations from two pages and confirm one succeeds while the other shows a revision conflict.
- 应用重大结构化调整，确认 active plan 内容和版本变化；撤销后确认内容恢复且产生新版本 / Apply a major structured adjustment, verify content and version changes, then revert and verify restored content in another version.
- reset 后刷新并确认项目为空且旧页面 mutation 被拒绝 / Reset, refresh to an empty project, and confirm mutations from an old page are rejected.
- 导出 JSON 并确认浏览器未暴露 DSH 模型凭据 / Export JSON and confirm no DSH model credentials are exposed.

## 可选真实模型 smoke / Optional live-model smoke

用户在 DSH Settings → Models 配置自己的密钥后，发送一条教学消息并确认流式响应。LearnLoop 不读取该密钥，此步骤不属于无密钥自动化。

After the user configures a key in DSH Settings → Models, send one teaching message and verify streaming. LearnLoop never reads the key; this step is outside keyless automation.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_create_plan_draft`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_create_plan_draft`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## LearnLoop Runtime V2 contract

- **User message:** visible and intent-only; retains the learner's original semantics and never contains LearnLoop control prompts or state JSON.
- **System Prompt:** Host-generated, session-scoped, recorded in DSH request/header and Trajectory, and supplies planning, learning-mode, and progression constraints.
- **Hard gate:** `Task N != completed => Task N+1 cannot become active`. Only domain commands advance plan state; model prose has no completion authority.
- **Mode gate:** `practiceCapacity=none => no implementation task and no artifact completion requirement`.
- **Migration:** v1 projects, plans, evidence, and mastery are retained; tasks receive safe lesson/short-answer defaults and projects require explicit session binding.
- **Current limitation:** no semantic post-filter rewrites arbitrary provider output. The deterministic state gate is enforced locally while recurring teaching behavior is constrained through DSH System Prompt. Inline checkpoints use the placeholder message range `learnloop-inline-checkpoint`.

## Runtime hardening (PR #20)

A LearnLoop Workspace may attach its active Project to the current DSH Session for execution. The Host returns a server-redacted projection to foreign sessions and rejects their project mutations; this local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. Same-origin remains the HTTP write boundary and LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: `project.sessionId === mutation.sessionId`; active and blocked current tasks cannot coexist; `foreign => no project, plan, evidence, mastery, assessment, adjustment, or event content`.

## Browser trust boundary
The web client may call only begin/cancel check for verification. It never sends confidence, message identifiers, event sequence, criterion result, or task completion. Owner export uses the dedicated export endpoint; settings-only and foreign views cannot download a project.


## Canonical persistence boundary (0.2.0)

Schema 5 stores business data only at `workspaces[workspaceId].projects[projectId]`. Projects independently own profile, plans, execution, candidates, verified evidence and assessments, mastery, adjustments, and review state. `activeSessionId` is an execution attachment, not ownership. API v2 reads by Workspace; storage unit 2 rejects earlier LearnLoop states. No code automatically resets or deletes DSH data.
