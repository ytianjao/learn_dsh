# 变更日志 / Changelog

## 0.10.0 — lesson article generation and export

- Breaking epoch: package 0.10.0, state schema 14, Storage Domain 11; HTTP API v3 gains content actions and routes. Clear only LearnLoop domain data or use an isolated `DSH_HOME`.
- Passing a verified task records durable teaching segments and a pending capture request; `generate-articles` creates or resumes the single project generation job, materializes the private Lesson Source Snapshot, and wakes the owning Agent through the public Agent handle.
- New `learnloop_write_lesson_document` tool: the model submits only a structured `LessonDocumentIntent`; the Host validates schema, Markdown safety, privacy, and reference-link provenance, then derives identity, sequence, slug, revision, provenance, and immutable storage.
- New export pipeline: per-lesson or whole-course export writes Markdown, a static HTML site, PDF (local Chromium-family browser), EPUB, and a combined ZIP into one fresh subdirectory of a learner-chosen directory; export records persist for replay-safe open and download.
- Plan view gains per-task article status, failure reasons, retry, regenerate, preview, and export controls.
- Fixed the content repository's Windows directory-sync failure and unified the two divergent canonical-JSON hash implementations.

## Unreleased — DSH compatibility

- Closed Interview uncertainty and clarification transitions with persisted presentation stages,
  canonical structured answers, and payload-bound replay receipts. State schema 13, Storage
  Domain 10, and backup format 8 form a clean persisted epoch.
- Upgraded every directly used Harness package to the exact `0.1.1-rc.2` release family.
- Centralized the official release commit in `scripts/dsh-baseline.json` and migrated
  assessment provenance to public typed Session events in a fail-closed adapter.
- Removed the rc.8 ask-user patch and local System Prompt typing workaround.

## 0.2.0

- Breaking: removed support for pre-canonical LearnLoop persisted states and backup format 1.
- Canonical schema 5 stores all learning data inside Workspace Project aggregates; storage unit 2 and HTTP API v2 establish the new epoch.
- Sessions now attach execution context and no longer own projects.


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

## Unreleased
- Added state schema v3, payload-bound command receipts, session-backed Evidence Candidates, criterion-complete verified assessments, and owner-only project export.
- Removed the browser-authoritative evidence/completion route; expected domain errors now carry stable codes.

## 0.4.0

- **Breaking:** replaced the domain-shaped plan Tool with `learnloop_create_plan_draft`, whose
  sole model argument is a minimal, closed Plan Intent.
- Host now compiles canonical text-verified tasks and owns identity, revisions, idempotency,
  IDs, linear dependencies, and status.
- Upgraded state schema to 6, Storage Domain to 3, HTTP API to v3, and backups to format 3.
  No migration, compatibility aliases, or legacy backup import are provided.

## Current LearnLoop interaction protocol

Activation is Host-owned: button → HTTP `begin-learning-mode` → `interviewing` Project → visible learner intent. The agent interviews, commits and obtains explicit Profile confirmation, creates a Draft Plan, and asks the learner to **确认并启用计划 / Confirm and activate plan**. After confirmation the Plan is active, execution is null, and all Tasks remain pending. Teaching starts only after the learner explicitly starts the first Task in LearnLoop. LearnLoop phase policy and domain guards reject wrong-phase model calls with `INVALID_PROJECT_PHASE`; model-visible outputs use semantic fields such as `profileRevision`, `planId`, and `planVersion`, never a generic workspace revision.

## 0.6.0 — Canonical learning content

- Established schema 9 content indexes, private source snapshots, canonical lesson documents, generation jobs, AST-based Markdown validation, privacy scanning, and an atomic Host-owned content repository.
- Storage Domain 6 and backup format 4 form a clean epoch; DSH remains pinned to 0.1.1-rc.2.
- Static HTML publication, directory selection, ZIP, VitePress, PDF and EPUB remain out of scope.

## 0.7.0 host-authoritative onboarding

Runtime V4 resolves `AssembleContext.agent.id`, persists a one-topic-at-a-time evidence-backed interview, and moves Profile/Plan approval to explicit LearnLoop UI HTTP actions. Schema 10, Storage Domain 7, and backup 5 are a clean epoch; clear only LearnLoop data. Static HTML publication remains out of scope.

## 0.8.0 — adaptive onboarding runtime

- Replaced topic-as-question onboarding with Host-owned required Probes and deterministic Profile compilation.
- Added Host-authoritative Plan View approval/revision controls and the `LEARNLOOP_TOOL_ERROR_V2` recovery directive.
- Advanced the breaking persistence epoch to state schema 11, Storage Domain 8, and backup format 6. DSH remains pinned to 0.1.1-rc.2.
- Canonical lesson JSON remains the content fact model; HTML, static publication, directory selection, and ZIP are still out of scope.

## 0.9.0 — learner-first scaffolded interview

- Breaking epoch: package 0.9.0, state schema 12, Storage Domain 9, backup format 7; HTTP API v3 and pinned DSH 0.1.1-rc.2 are unchanged.
- Removed learner-facing `goal.kind`; onboarding now captures `goal.subject` first and scaffolds `goal.outcome` with validated model suggestions or a generic Host ladder.
- Added opaque pending-question tokens, option snapshots, Probe-specific uncertainty, deterministic result actions, safe error recovery, and separate learner/Host field origins.
- No schema-11 migration or legacy no-argument Tool alias is provided. Clear only LearnLoop domain data or use an isolated `DSH_HOME`.
