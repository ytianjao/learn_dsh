# LearnLoop for DeepSeek Harness

LearnLoop is a local-first learning companion for DSH `0.1.1-rc.2` (baseline `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`). It requires Node `^22.19.0 || >=24` and pnpm `11.7.0`. LearnLoop never reads or manages model credentials.

## Canonical workspace and content model (0.6.0)

Persisted schema 7 has one root: `schemaVersion`, `revision`, `settings`, `workspaces`, and scoped `commandReceipts`. Each Workspace owns project identities, `activeProjectId`, `activeSessionId`, revision, and events. Each Project aggregate owns its profile, immutable plan versions, execution, candidates, verified assessments and evidence, mastery, adjustments, misconceptions, and review queue. A Session is only the current execution attachment; changing sessions does not move or copy a project.

The HTTP boundary is `/learnloop/api/v3/state`, `/learnloop/api/v3/manage`, and `/learnloop/api/v3/export`. State reads are scoped by `workspaceId`; backup format 3 exports only the canonical Workspace aggregate and current settings.

## Install and verify

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm test
```

Install with `dsh plugin --profile web add .`, then start `dsh web`. Users explicitly select **开启学习模式 / Start learning mode**, complete the native guided interview, confirm the profile, review a draft, and approve it before teaching begins.

## Verified Answer Loop

A formal check captures the next direct DSH user message in the active Workspace Project. `learnloop_assess_answer` validates every criterion. `needs-work` keeps the task active and creates no Evidence. `passed` or `excellent` atomically writes the Assessment, Evidence, Mastery change, and task completion. The next task still requires explicit start.

## Breaking upgrade from pre-canonical builds

Pre-canonical persisted states and backup format 1 are intentionally unsupported; no automatic migration, reset, or deletion occurs.

1. Stop DSH.
2. Back up the complete `DSH_HOME` if an audit copy is needed.
3. Remove only LearnLoop's Storage Domain data using a DSH-supported domain reset facility.
4. Do **not** delete model credentials, Workspace/Session data, other plugin data, or the whole `DSH_HOME`.
5. Restart DSH and create projects again from **开启学习模式**.

The pinned DSH release does not expose a documented, safe command for selectively deleting one plugin domain. Consequently this project does not publish a destructive filesystem command. If selective cleanup cannot be established safely, start DSH with a new isolated `DSH_HOME` and retain the old directory as a backup.

## Breaking upgrade to 0.5.0

The model-facing planning contract is **Plan Intent only**. Workspace, Project, revisions,
idempotency, IDs, dependencies, and status are Host-owned. Canonical task verification is
text-only; artifact, file, upload, and repository verification are not supported.

State schema 8, Storage Domain version 2, HTTP API v2, backup format 2, and the former plan
Tool are rejected and have no migration or alias. Stop DSH, then either use a fresh isolated
`DSH_HOME` or clear only the LearnLoop Storage Domain. Do not delete model credentials,
Workspaces, Sessions, or unrelated plugin data. Restart DSH and enable learning mode again.

### Agent protocol

The **Start learning mode** button is the only activation boundary: the Host creates an `interviewing` Project before submitting “开始建立我的学习档案。 / Start building my learning profile.” No onboarding tool is exposed to the model. DSH 0.1.1-rc.2 registers tools globally, so LearnLoop publishes an exact phase allow-list in each system prompt and independently enforces it at the Tool executor/domain boundary. Plan approval activates the plan but leaves every task pending; the learner must explicitly start the first task in LearnLoop.


## Learning content epoch (0.6.0)

State schema 9, Storage Domain 6 and backup format 4 are a clean breaking epoch. Clear only the LearnLoop Storage Domain (or use a fresh isolated `DSH_HOME`); never delete credentials, Sessions, other plugins, or the whole DSH home. LearnLoop stores private source snapshots and canonical lesson JSON below an opaque hashed content path. HTML/static-site export is not included.

## 0.7.0 host-authoritative onboarding

Runtime V4 resolves `AssembleContext.agent.id`, persists a one-topic-at-a-time evidence-backed interview, and moves Profile/Plan approval to explicit LearnLoop UI HTTP actions. Schema 10, Storage Domain 7, and backup 5 are a clean epoch; clear only LearnLoop data. Static HTML publication remains out of scope.

## 0.8.0 adaptive interview contract

An Interview Topic is not one question. A required **Probe** is the smallest Host-verifiable information slot, and a non-empty answer does not by itself complete a Topic. The Host owns Probe progression and compiles the Profile from learner evidence; the model cannot submit a complete Profile. Profile and Plan approval are direct View actions. Canonical `LessonDocument` JSON remains the learning-content fact source; HTML publication is a later release.
