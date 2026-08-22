# 上游兼容性 / Upstream compatibility

当前边界固定为 DSH `0.1.0-rc.8`。Host 依赖 `storageDomain.open`、domain table `get/put/update` 和 `webServer.register`；Client 依赖 `window.__ModuleLoader__.load` 及 `conversation.view`、`conversation.input.dock`、`settings.section` slots。

The current boundary is pinned to DSH `0.1.0-rc.8`. The Host depends on `storageDomain.open`, domain-table `get/put/update`, and `webServer.register`; the Client depends on `window.__ModuleLoader__.load` and the `conversation.view`, `conversation.input.dock`, and `settings.section` slots.

升级时运行 `npm run test:compat && npm run build && npm test`，随后对已安装 profile 执行中英文切换、重启持久化和变更冲突 smoke。若任何 seam 变化，先更新适配器与本文档，再改变 peer pin。

On upgrade, run `npm run test:compat && npm run build && npm test`, then smoke-test Chinese/English switching, restart persistence, and mutation conflicts in an installed profile. If any seam changes, update the adapter and this document before changing peer pins.

## LearnLoop Runtime V2 contract

- **User message:** visible and intent-only; retains the learner's original semantics and never contains LearnLoop control prompts or state JSON.
- **System Prompt:** Host-generated, session-scoped, recorded in DSH request/header and Trajectory, and supplies planning, learning-mode, and progression constraints.
- **Hard gate:** `Task N != completed => Task N+1 cannot become active`. Only domain commands advance plan state; model prose has no completion authority.
- **Mode gate:** `practiceCapacity=none => no implementation task and no artifact completion requirement`.
- **Migration:** v1 projects, plans, evidence, and mastery are retained; tasks receive safe lesson/short-answer defaults and projects require explicit session binding.
- **Current limitation:** no semantic post-filter rewrites arbitrary provider output. The deterministic state gate is enforced locally while recurring teaching behavior is constrained through DSH System Prompt. Inline checkpoints use the placeholder message range `learnloop-inline-checkpoint`.

## Runtime hardening (PR #20)

A LearnLoop project is bound to exactly one DSH Session. The Host returns a server-redacted projection to foreign sessions and rejects their project mutations; this local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. Same-origin remains the HTTP write boundary and LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: `project.sessionId === mutation.sessionId`; active and blocked current tasks cannot coexist; `foreign => no project, plan, evidence, mastery, assessment, adjustment, or event content`.
