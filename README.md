# LearnLoop for DeepSeek Harness

LearnLoop is a local-first learning companion for DSH `0.1.1-rc.2` (baseline `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`). It requires Node `^22.19.0 || >=24` and pnpm `11.7.0`. LearnLoop never reads or manages model credentials.

## Canonical workspace and content model

Persisted schema 15 has one root: `schemaVersion`, `revision`, `settings`, `workspaces`, and scoped `commandReceipts`. Each Workspace owns project identities, `activeProjectId`, `activeSessionId`, revision, and events. Each Project aggregate owns its profile, immutable plan versions, execution, candidates, verified assessments and evidence, mastery, misconceptions, and the content index (lesson references, capture requests, generation jobs, export records). Task dependencies are derived from plan order. A Session is only the current execution attachment; changing sessions does not move or copy a project.

The HTTP boundary is `/learnloop/api/v3/state`, `/learnloop/api/v3/manage`, `/learnloop/api/v3/export`, `/learnloop/api/v3/lesson` (article preview), and `/learnloop/api/v3/export-file` (ZIP download). State reads are scoped by `workspaceId`; backup format 9 exports only the canonical Workspace aggregate and current settings.

Private lesson source snapshots and canonical lesson documents live as immutable, schema-validated JSON files below `$DSH_HOME/learnloop/content/ws-<hash>/project-<hash>`; main state stores only references and jobs.

## Install and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run verify:article-export   # real article + export artifacts in a temp directory
```

Install with `dsh plugin --profile web add .`, then start `dsh web`. Users explicitly select **开启学习模式 / Start learning mode**, complete the native guided interview, confirm the profile, review a draft, and approve it before teaching begins.

## Verified Answer Loop

A formal check captures the next direct DSH user message in the active Workspace Project. `learnloop_assess_answer` validates every criterion. `needs-work` keeps the task active and creates no Evidence. `passed` or `excellent` atomically writes the Assessment, Evidence, Mastery change, task completion, and the task's durable lesson capture record. The next task still requires explicit start.

## Lesson article generation and export

After a task passes formal verification, the LearnLoop Plan view offers **生成文章 / Generate article** for that task (or **生成全部文章 / Generate all articles** for every verified task in plan order).

1. The Host materializes a private, bounded Lesson Source Snapshot from the captured teaching segments, the accepted Assessment, accepted Evidence, and resolved misconceptions — never the raw chat transcript or learner answers.
2. The Host wakes the owning DSH Agent; the model writes the article inside the ordinary Agent Loop and submits only a structured `LessonDocumentIntent` through `learnloop_write_lesson_document`. LearnLoop never calls a provider directly.
3. The Host validates structure, Markdown safety, privacy, and reference links (every link must literally appear in the captured teaching content), derives identity/sequence/slug/provenance, and stores the immutable document.

The Plan view shows per-task article status, failure reasons, retry, and regenerate. **预览 / Preview** opens the rendered article in a browser tab. **导出本文 / Export** and **导出整门课程 / Export course** write Markdown, a static HTML site, PDF (via the locally installed Edge/Chrome), EPUB, and a combined ZIP into one fresh subdirectory of a learner-chosen directory; **打开目录 / Open folder** and **下载 ZIP / Download ZIP** complete the loop.

## Agent protocol

The **Start learning mode** button is the only activation boundary: the Host creates an `interviewing` Project before submitting “开始建立我的学习档案。 / Start building my learning profile.” No onboarding tool is exposed to the model. DSH 0.1.1-rc.2 registers tools globally, so LearnLoop publishes an exact phase allow-list in each system prompt and independently enforces it at the Tool executor/domain boundary. Plan approval activates the plan but leaves every task pending; the learner must explicitly start the first task in LearnLoop.

## 0.9 learner-first Profile interview

Profile onboarding starts with **“你现在想学什么？ / What would you like to learn?”** and accepts the learner's own words through DSH's native custom-input path. Internal goal categories are not learner-facing questions. The Host then presents a validated cognitive ladder, treats uncertainty as a request for scaffolding, and records learner text, learner choices, and Host recommendations as distinct origins. Every pending native question has an opaque, durable `questionToken`; ordinary Chat can answer a Probe only after the Host explicitly enters `fallback-to-chat`. Profile View remains the final authorization boundary.

## Breaking upgrades

Every LearnLoop state-schema epoch is a clean break: pre-epoch persisted states and older backup formats are intentionally unsupported, with no automatic migration, reset, or deletion. Stop DSH, back up `DSH_HOME` if an audit copy is needed, clear only LearnLoop's Storage Domain data using a DSH-supported domain reset facility (never credentials, Workspace/Session data, or other plugins), and restart. If selective cleanup cannot be established safely, start DSH with a new isolated `DSH_HOME`. See `CHANGELOG.md` for the epoch history.
