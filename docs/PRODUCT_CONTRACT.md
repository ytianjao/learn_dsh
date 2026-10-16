# 产品契约 / Product contract

> Runtime baseline: all directly consumed Harness packages come from the npm registry, at the
> floating `^0.2.1-alpha.1` peer range declared in `package.json`. This maintenance upgrade does
> not change LearnLoop state schema, product fields, or HTTP API v3.

## 产品边界 / Product boundary

DSH 负责会话、流式 Chat、模型路由和凭据；LearnLoop 负责学习项目、计划、证据、掌握度和复盘事实。LearnLoop 不实现模型提供商客户端。

DSH owns sessions, streaming Chat, model routing, and credentials. LearnLoop owns learning projects, plans, evidence, mastery, and review facts. LearnLoop does not implement a model-provider client.

## 浏览器体验 / Browser experience

DSH Chat 保持默认输入面。LearnLoop 提供首次使用面板、当前任务、计划、进度、复盘和设置。所有 LearnLoop 网页文案可在简体中文与 English 间切换，选择持久化在 Host settings 中。

DSH Chat remains the default input surface. LearnLoop adds onboarding, current task, Plan, Progress, Review, and Settings. All LearnLoop web copy switches between Simplified Chinese and English, with the selection persisted in Host settings.

空状态、加载失败、连接失败和冲突必须显示可操作反馈。当前 v1 明确使用确定性的 Agent 工程初始模板，不把模板描述成语义生成结果。

Empty, waiting-for-model, loading, disconnected, and conflict states must offer actionable feedback. Only a validated learnloop_create_plan_draft call creates the authoritative plan.

## 学习规则 / Learning rules

经过验证的评测只有在包含来源范围和幂等键时才可作为证据。模型解释、“懂了”、停留时间或完成按钮本身不是证据。

A verified assessment qualifies as evidence only with a source range and idempotency key. Model explanations, “I understand,” time on page, and the completion button alone are not evidence.

概念进入计划后为 introduced；一条证据为 practicing；两条高置信证据为 demonstrated；三条高置信证据且包含 assessment 才是 mastered。任务完成与掌握度相互独立。

A concept in the plan is introduced; one evidence item means practicing; two high-confidence items mean demonstrated; mastery requires three high-confidence items including an assessment. Task completion and mastery remain independent.

## 一致性与权威 / Consistency and authority

Host 是唯一权威状态。每个 mutation 在原子更新中检查单调 revision，并以幂等键安全处理重试。reset 不得令 revision 回退。

The Host is the sole authority. Every mutation checks a monotonic revision inside an atomic update and safely handles retries by idempotency key. Reset must never roll the revision backward.

通过当前任务界面完成任务并提交证据时，Evidence、Mastery 和 Task 状态在同一个 Host 原子更新中提交。

When a task is completed with evidence from the current-task interface, Evidence, Mastery, and Task state are committed in the same atomic Host update.

## 隐私与安全 / Privacy and security

LearnLoop 不接收模型密钥。变更接口在读取 body **之前**校验 JSON content type 与专用 mutation header（`x-learnloop-mutation: learnloop-v3`），并按字节流限制 128 KiB；超限立即停止累计并返回 413，不产生任何 mutation。读取路径按 Workspace 授权，跨源请求被拒绝。这些是 local-first 隔离措施，**不是**多用户身份认证。DSH 的 web server 只负责路由注册与静态服务，不提供 CSRF 校验、body 上限或 413，因此上述边界由 LearnLoop 自己承担。导出包含学习数据，用户应按敏感数据保护。

LearnLoop never receives model credentials. The mutation API validates the JSON content type and a dedicated mutation header (`x-learnloop-mutation: learnloop-v3`) **before reading the body**, and enforces a 128 KiB limit on the byte stream; an over-limit request stops accumulating at once and returns 413 without performing any mutation. Read paths are Workspace-scoped and cross-origin requests are refused. These are local-first isolation measures, **not** multi-user authentication. DSH's web server registers routes and serves assets but provides no CSRF check, body ceiling, or 413, so LearnLoop owns these guards itself. Exports contain learning data and should be protected as sensitive information.


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_create_plan_draft`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_create_plan_draft`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## LearnLoop Runtime V2 contract

- **User message:** visible and intent-only; retains the learner's original semantics and never contains LearnLoop control prompts or state JSON.
- **System Prompt:** Host-generated and session-scoped. The LearnLoop section (`LEARNLOOP_RUNTIME_V10`) is static for a learning session: the fixed policy and every phase policy, keyed by phase, so DSH never re-appends it. / LearnLoop 系统提示词分区在一个学习会话内保持不变：固定规则加按阶段列出的全部阶段规则，DSH 因此不会重复追加。
- **Runtime state:** the changing part is a runtime-context block (`LEARNLOOP_STATE_V1`) with the phase, `allowedTools`, `requiredTools` (empty where every LearnLoop tool is optional, such as teaching), `planConstraints`, and only the data the phase needs. DSH appends it only when its text changes. The interview question contract and the recorded answer travel in tool results; the full plan is read on demand with `learnloop_get_plan`. / 变化的部分放在运行时上下文块中：阶段、允许的工具、必须调用的工具（讲解等可选阶段为空）、计划约束，以及该阶段需要的数据；只有文本变化时 DSH 才追加。访谈题目契约与刚记录的回答随工具结果返回；完整计划通过 `learnloop_get_plan` 按需读取。
- **Tool declarations:** a learning session declares every LearnLoop tool throughout; a call the phase does not allow is rejected before it runs with `INVALID_PROJECT_PHASE` (`refresh-state`). / 学习会话始终声明全部 LearnLoop 工具；当前阶段不允许的调用会在执行前以 `INVALID_PROJECT_PHASE` 拒绝。
- **Hard gate:** `Task N not in {completed, skipped, studied} => Task N+1 cannot become active`. Only domain commands advance plan state; model prose has no completion authority.
- **Optional check:** the learner may finish the current Task without a check (`finish-task-without-check`, from teaching, an armed check, or needs-revision). The Task becomes `studied`: it unlocks the next Task but writes no assessment, evidence, or mastery, and it has no lesson article (articles need an accepted assessment). `recheck-task` makes a studied Task current again so the check can be taken later, while no other Task is current. / 学习者可以不做检查直接结束当前任务（`finish-task-without-check`，可在讲解中、检查已武装或需要修订时使用）。任务变为 `studied`：会解锁下一任务，但不写入评估、证据或掌握度，也不会生成课文（课文需要已通过的评估）。在没有其它当前任务时，`recheck-task` 可让已学任务重新成为当前任务以补做检查。
- **Questions during a check:** an armed check captures the next learner message. If it is a question, a request, or off-topic, the verifier calls `learnloop_release_check`: the check returns to teaching, no assessment is written, and the attempt is not counted. Any attempt to answer, however wrong, is still assessed. / 检查武装后会捕获学习者的下一条消息。若该消息是提问、请求或无关内容，评测方调用 `learnloop_release_check`：检查回到讲解，不写评估，也不计入尝试次数。任何作答尝试（无论多错）仍会被评估。
- **Mode gate:** `practiceCapacity=none => no implementation task and no artifact completion requirement`.
- **Plan constraints:** while planning or active, the runtime state carries `planConstraints` (`allowedActivities`, `minExplainOrExampleShare`, `exampleInEveryStage`, `maxTotalMinutes`), derived from the confirmed Profile by the same function that validates the Plan Intent. An `INVALID_PLAN` tool error carries `details.violation` naming the broken rule and, for the mode gate, the offending tasks.
- **Migration:** v1 projects, plans, evidence, and mastery are retained; tasks receive safe lesson/short-answer defaults and projects require explicit session binding.
- **Current limitation:** no semantic post-filter rewrites arbitrary provider output. The deterministic state gate is enforced locally while recurring teaching behavior is constrained through DSH System Prompt. Inline checkpoints use the placeholder message range `learnloop-inline-checkpoint`.

## Runtime hardening (PR #20)

A LearnLoop Workspace may attach its active Project to the current DSH Session for execution. Session identity is resolved through the DSH Workspace registry: a mutation whose Session is not attached to the Workspace it claims is rejected (`WORKSPACE_MISMATCH`), and a Session attached to no Workspace is rejected (`WORKSPACE_NOT_FOUND`). This local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. The HTTP write boundary is the mutation header and Origin check described under Privacy and security; LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: a mutation's canonical Workspace and Session come from the DSH registry, not from the client's claim; active and blocked current tasks cannot coexist.

## Verified answer invariants
- **Candidate provenance:** every `candidate.source.messageIds` identifies a real DSH `user/message` in `project.sessionId`.
- **Assessment:** every acceptance criterion has exactly one criterion result.
- **Completion:** `task.status === completed` implies a verified assessment result of `passed` or `excellent`.
- **Visibility:** the answer appears as an ordinary Chat user message; verifier policy appears only in System Prompt/trajectory.
- **Mastery:** one passed answer produces `practicing` and never `mastered`; a concept reaches `mastered` only by accumulating three verified evidence items including a formal assessment, which for a shared concept means more than one Task.
- **Backup:** a Workspace export is answered over the local HTTP boundary and contains that Workspace's learning data; it is not an owner-session-only operation.

Verified Answer Loop v1 accepts text only. It does not automatically verify images or artifacts, or rewrite arbitrary model prose. Mastery is evidence-count based rather than time-decayed: `nextReviewAt` is recorded but no spaced-review scheduler consumes it yet. Model judgment can still be wrong; the host nevertheless enforces provenance, complete criterion coverage, and state boundaries.


## Canonical persistence boundary (0.2.0)

The state stores business data only at `workspaces[workspaceId].projects[projectId]`. Projects independently own profile, plans, execution, candidates, verified evidence and assessments, mastery, and misconceptions. `activeSessionId` is an execution attachment, not ownership. API v3 reads by Workspace; the current Storage Domain version rejects states from earlier epochs (see `CHANGELOG.md`). No code automatically resets or deletes DSH data.

## Canonical Plan Intent contract (0.5.0)

Models submit only ordered stages with learner-visible title/outcome and tasks containing
`title`, `objective`, `activity`, `acceptanceCriteria`, `checkPrompt`, and `estimateMinutes`.
The Host compiles UUID identities, a deterministic linear dependency chain, pending statuses,
and a draft plan atomically. Current verification is text-only. Artifact/file/repository
verification is not supported in the current canonical contract. Legacy state and contracts
are rejected rather than migrated or silently reset.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent drives the Host-defined interview, the Host compiles the Profile and obtains explicit Profile confirmation, the agent creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.

### Upstream rc.8 limitations

DSH rc.8 exposes Agent-scoped `agent.ctx.tools.restrict({ deny })` and `guard()`. LearnLoop derives one phase policy and applies an exact deny-list to its own model tools and `ask_user_question`; this changes both request schemas and execution while leaving unrelated Host tools untouched. Domain phase guards remain authoritative. The public `ToolRunContext` has no nested native-question dispatch service, so LearnLoop does not fabricate question-result semantics.

## Unified learning action and phase capabilities (0.5.0)

Task execution has one primary entry in the conversation composer. The plan view is read-only for task execution: it presents stages, task state, Evidence, and Mastery without start/check/pause/resume/skip controls. `derivePrimaryLearningAction` maps Project, Session, and execution state to the only current action.

The phase policy permits the Host interview tool while interviewing; profile confirmation or a revision request in profile review; plan draft creation and explicit preference revision while planning; plan revision, explicit preference revision, and approval in plan review; and assessment only while awaiting an answer or verifying. Native questions are limited to interviewing, profile review, and plan review. Teaching and needs-revision prohibit shadow quizzes.

Preference revision is learner-initiated, increments the Profile revision, clears confirmation, archives a draft, and returns to profile review. Plan validation otherwise repairs Plan Intent within confirmed constraints. Example density is `high` only when the learner picks the Host option `example-rich`; no learner or model wording is interpreted.

Command receipts store canonical Profile confirmation/preference-revision and Plan approval results before later phase validation, so exact retries replay after phase advancement. Activation uses a per-click `activationAttemptId`; one network retry reuses it, while a new activation after clear creates a new attempt.

## Runtime V4 review boundary

Onboarding uses one persisted interview topic at a time. Profile and Plan review decisions are Host-authoritative UI/HTTP actions; model approval tools are absent. Approval never starts a task.


---

# Product Contract

LearnLoop is learner-first: it stores the learner's raw subject before creating planning structure. Internal classifications never become the first question. DSH native custom input is a supported protocol path. Probes express Host information needs rather than a rigid form. Recommendations and learner evidence have distinct origins and remain reviewable. Every Probe's kind, cardinality, and option codes are Host-defined (`docs/PROFILE_INTERVIEW.md`); the model only rewords, relabels codes, records labelled assumptions, or adds bounded follow-ups, and ordinary Chat is reserved for explicit Host fallback. The content runtime generates Host-validated lesson articles through `learnloop_write_lesson_document` and exports them as Markdown, a static HTML site, PDF, EPUB, and a combined ZIP.
