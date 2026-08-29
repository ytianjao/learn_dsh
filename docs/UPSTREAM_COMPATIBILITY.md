# 上游兼容性 / Upstream compatibility

The single machine-readable baseline is `scripts/dsh-baseline.json`. GitHub published
`dsh-v0.1.2-alpha.1`, but the corresponding npm package family was not published at the
migration date. LearnLoop therefore uses the newest complete npm family, `0.1.1-rc.2`,
pinned to official tag commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

| LearnLoop | DSH | Commit | Node | pnpm | Cordis | Known limitation |
| --- | --- | --- | --- | --- | --- | --- |
| 0.5.0 | 0.1.1-rc.2 | b150a551b8d465e31e418e1b2eaf5e79bbb7d28e | ^22.19.0 or >=24 | 11.7.0 | 4.0.1 | Provenance fails closed when required raw events are absent or ambiguous after external log rewriting. |

当前边界固定为 DSH `0.1.1-rc.2`。Host 依赖 `storageDomain.open`、domain table `get/put/update` 和 `webServer.register`；Client 依赖 `window.__ModuleLoader__.load` 及 `conversation.view`、`conversation.input.dock`、`settings.section` slots。

The current boundary is pinned to DSH `0.1.1-rc.2`. The Host depends on `storageDomain.open`, domain-table `get/put/update`, and `webServer.register`; the Client depends on `window.__ModuleLoader__.load` and the `conversation.view`, `conversation.input.dock`, and `settings.section` slots.

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

A LearnLoop Workspace may attach its active Project to the current DSH Session for execution. The Host returns a server-redacted projection to foreign sessions and rejects their project mutations; this local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. Same-origin remains the HTTP write boundary and LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: `project.sessionId === mutation.sessionId`; active and blocked current tasks cannot coexist; `foreign => no project, plan, evidence, mastery, assessment, adjustment, or event content`.

## Typed Session integration
Verified-answer integration is constrained to pinned DSH 0.1.1-rc.2 public agent/session/tool surfaces: waterfall pre-step decisions, direct user-message source kinds, public Session events, and tool execution agent/call/signal provenance. DSH source and provider credentials remain untouched.


## Canonical persistence boundary (0.2.0)

Schema 8 stores business data only at `workspaces[workspaceId].projects[projectId]`. Projects independently own profile, plans, execution, candidates, verified evidence and assessments, mastery, adjustments, and review state. `activeSessionId` is an execution attachment, not ownership. API v3 reads by Workspace; storage domain 5 rejects earlier LearnLoop states. No code automatically resets or deletes DSH data.

## rc.8 Tool schema audit for Plan Intent

Pinned DSH 0.1.1-rc.2 publicly supports `defineTool`, `title`, `description`, `examples`, `enum`,
`const`, `oneOf`, and explicit-object `additionalProperties`. Its implicit parameter root is
open, so the plan executor rejects root keys other than `plan` before reading state. Typed
validation raises `INVALID_ARGS` before the executor. `finalizeContent` receives normalized
failures and is used to explain an invalid activity path/value/allowed set without retrying or
rewriting it. The returned Tool definition exposes its canonical schema and validated executor
as the public testing seam. No upstream code is modified.
