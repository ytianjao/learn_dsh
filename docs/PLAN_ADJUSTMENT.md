# 计划调整 / Plan adjustment

## 提议 / Proposal

计划启用后，模型可通过 `learnloop_propose_plan_adjustment` 提议修订：插入任务、为已记录的误区补充讲解、拆分过大的任务，或调整顺序。该工具仅在 Project 处于 `active` 阶段时可见、可执行。模型提交修订理由和一份完整的最小 Plan Intent；Host 按已确认的画像校验，编译为新的不可变计划版本（版本号 +1，状态 `draft`），并记录 `pendingPlanAdjustment`。当前计划继续生效；同一时间只能存在一个未处理的修订。

Once a plan is active, the model may propose a revision through `learnloop_propose_plan_adjustment`: insert a task, add remediation for a recorded misconception, split an oversized task, or reorder. The tool is visible and executable only while the Project is `active`. Under `LEARNER_QUESTION_POLICY_V1` the model answers a learner question first, and proposes an adjustment only when the question shows a need the remaining plan does not cover; the runtime data carries `activePlan.planIntent` (the active plan in copyable intent shape), `taskStatuses`, and `pendingAdjustment` so it can resubmit the whole plan. / 在 `LEARNER_QUESTION_POLICY_V1` 下，模型先回答学习者的问题，只有当问题暴露出剩余计划未覆盖的需求时才提议调整；运行时数据提供 `activePlan.planIntent`（可直接复用的当前计划意图）、`taskStatuses` 与 `pendingAdjustment`，以便模型提交完整计划。 The model submits a reason and a complete minimal Plan Intent; the Host validates it against the confirmed Profile, compiles a new immutable plan version (next version number, status `draft`), and records `pendingPlanAdjustment`. The active plan keeps running, and only one unsettled revision may exist at a time.

## 保留已验证的工作 / Verified work is kept

当前计划中已完成、已跳过或已学（`studied`）的任务，在新版本中按标准化标题（去空白、小写）匹配后保持原状态；在修订中改名的已完成任务会回到 pending。复用已有任务的 `conceptKey` 会沿用同一个 `conceptId`，掌握度因此继续累积。

Completed, skipped, and studied Tasks of the active plan keep their status in the new version, matched by normalized title (trimmed, lower-cased); renaming a completed Task in a revision returns it to pending. Reusing an existing Task's `conceptKey` keeps the same `conceptId`, so mastery keeps accumulating.

## 学习者决定 / The learner decides

修订只能由学习者在计划视图中处理，模型没有批准工具。`approve-plan-adjustment` 把草案设为 active、旧版本设为 superseded；保留仍存在概念的掌握度行，为新概念引入行，删除被移除概念的行；若当前执行指向的任务已不存在，执行被清空。`discard-plan-adjustment` 把草案归档，之后可再次提议。两者都是 HTTP v3 Host 命令，遵循 Workspace/Session 归属、revision 检查与幂等回执。

Only the learner settles a revision, from the Plan view; the model has no approval tool. `approve-plan-adjustment` makes the draft active and supersedes the previous version; mastery rows for surviving concepts are kept, rows for new concepts are introduced, and rows for removed concepts are dropped. If the current execution points at a Task the revision removed, execution is cleared. `discard-plan-adjustment` archives the draft so a later adjustment can be proposed. Both are HTTP v3 Host commands with the usual Workspace/Session ownership, revision check, and idempotent receipt.

## 重放 / Replay

工具调用以 `plan-adjustment:<callId>` 为幂等键；同一调用重放时返回已记录的结果，内容不同则以 `IDEMPOTENCY_KEY_REUSED` 拒绝。

Each tool call uses `plan-adjustment:<callId>` as its idempotency key. Replaying the same call returns the recorded result; reusing the key with different content is rejected with `IDEMPOTENCY_KEY_REUSED`.
