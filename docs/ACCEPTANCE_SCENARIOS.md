# 验收场景 / Acceptance scenarios

执行前先完成 `docs/CLOUD_ACCEPTANCE.md`。记录 PR commit、DSH baseline、浏览器版本及每项结果，但不要在截图或日志中包含密钥。

Complete `docs/CLOUD_ACCEPTANCE.md` first. Record the PR commit, DSH baseline, browser version, and each result, but never include credentials in screenshots or logs.

| 场景 / Scenario | 操作 / Actions | 通过标准 / Pass criteria |
| --- | --- | --- |
| 首次立项 / First project | 在首次使用面板输入目标、经验与每周时间并开始 / Enter a goal, experience, and weekly time in onboarding and start | 项目建立，出现当前任务；没有 key 也可完成 / Project and current task appear without a key |
| 计划生成 / Plan generation | 打开学习计划并展开所有阶段 / Open Plan and expand all stages | 只有一个 active v1，任务目标、预计时间与验收标准可见 / Exactly one active v1 with objectives, estimates, and criteria |
| 学习对话 / Learning conversation | 自动通道使用 mock；可选人工通道在 DSH Chat 发一条教学问题 / CI uses mock; optionally send one teaching question in DSH Chat | Mock 返回固定响应；人工通道流式完成且 LearnLoop 不接触 key / Mock returns fixed text; optional live stream completes and LearnLoop never receives the key |
| 证据更新 / Evidence update | 在当前任务选择“完成并提交证据”，输入自己的解释 / Complete the current task and submit the learner's explanation | Evidence 出现在进度与复盘；只点击完成不会单独提升掌握度 / Evidence appears in Progress and Review; completion alone does not raise mastery |
| 进度更新 / Progress update | 提交足够的不同证据并展开概念 / Submit diverse evidence and expand the concept | 掌握度按 introduced → practicing → demonstrated → mastered 离散变化，并列出依据 / Discrete levels and rationale follow the evidence rules |
| 小调整 / Minor adjustment | 产生或注入一个 update/move 小调整 / Produce or fixture a minor update/move operation | 启用自动小调整时生成新 active version，旧版本 superseded，内容真正改变 / New active version is created and content actually changes |
| 重大调整批准 / Major approval | 提交 major proposal，在计划页先观察再批准 / Submit a major proposal, inspect it, then approve | 批准前计划不变；批准后新版本生效；revert 再产生恢复版本 / No pre-approval change; apply and revert each create immutable versions |
| 刷新恢复 / Refresh recovery | 记录项目、任务和证据后刷新浏览器 / Refresh after project, task, and evidence writes | project、active plan、evidence、mastery 和语言设置保持 / Project, plan, evidence, mastery, and language persist |
| DSH 重启恢复 / DSH restart | `Ctrl+C` 停止，再运行 `pnpm run acceptance:web` / Stop and restart with the same command | 使用相同隔离 DSH_HOME 恢复全部状态 / All state returns from the same isolated DSH_HOME |
| Provider 错误 / Provider error | 在 keyless E2E 将 mock sequence 改为 `auth_error` 或 `server_error` 后提问 / Run a local mock error behavior and send a prompt | DSH 显示可操作错误，不出现部分成功；LearnLoop 页面仍可用 / Actionable error, no false success, LearnLoop remains usable |
| Key 不泄漏 / Key non-disclosure | 检查 PR diff、Actions log、artifact、导出 JSON 和浏览器截图 / Inspect diff, logs, artifacts, export, and screenshots | 不含真实 key；自动化 mock provider 完全无密钥 / No real key; the automated mock provider is entirely keyless |

## 自动与人工边界 / Automated versus manual boundary

CI 自动覆盖 build、typecheck、lint、领域/HTTP、package validation、无密钥 DSH boot、页面垂直切片、刷新恢复及 artifact 留存。真实 DeepSeek 对话、计费账户行为和生产网络错误只能由用户选择执行，不能作为 PR 必需门禁。

CI covers build, typecheck, lint, domain/HTTP tests, package validation, keyless DSH boot, browser slices, refresh persistence, and artifacts. Live DeepSeek conversation, billed-account behavior, and production network failures are user-opt-in and cannot be required PR gates.


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

## Verified answer scenario
Arm the active task, answer in normal Chat, observe needs-work without evidence/completion, arm again, answer correctly, then observe one atomic passed settlement. Confirm the successor stays pending until explicit start and a foreign Session sees no private projection.


## Canonical persistence boundary (0.2.0)

Schema 8 stores business data only at `workspaces[workspaceId].projects[projectId]`. Projects independently own profile, plans, execution, candidates, verified evidence and assessments, mastery, adjustments, and review state. `activeSessionId` is an execution attachment, not ownership. API v3 reads by Workspace; storage domain 5 rejects earlier LearnLoop states. No code automatically resets or deletes DSH data.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.
