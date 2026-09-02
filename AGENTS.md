# AGENTS.md — LearnLoop for DeepSeek Harness

Guidance for AI coding agents working in this repository. It assumes you know nothing
about the project. Read this before changing code.

## 1. Project overview

- **Package:** `@learnloop/dsh-learnloop` (version `0.10.0`, MIT license, pure ESM —
  `"type": "module"`).
- **What it is:** LearnLoop is a **local-first, long-term learning companion** delivered as
  a plugin for **DeepSeek Harness (DSH) Web**. It guides a learner through a profile
  interview, compiles a validated learning plan, teaches task-by-task, verifies typed
  answers, tracks mastery, and generates/exports lesson articles.
- **Form factor:** a single npm package that contains both a **Host plugin** (Cordis) and
  a **dependency-free Web client** (`client/bundle.js`) that DSH loads directly.
- **Source of truth for design intent:** the bilingual docs under `docs/` and
  `CHANGELOG.md`. When behavior and docs disagree, check git history and the strict Zod
  schemas in `src/types.ts` — the schemas are authoritative.

### Ownership boundary (the most important rule)

DSH owns sessions, streaming Chat, model routing, the tool-execution runtime, and **all
model credentials**. LearnLoop owns only the learning domain facts: projects, profiles,
plans, evidence, mastery, review state, adjustments, and generated content.

**LearnLoop never reads API keys, never implements a model-provider client, and never
calls a provider directly.** The model only ever acts through the registered LearnLoop
tools inside the ordinary DSH Agent Loop. Do not introduce any provider/HTTP client for
model access.

## 2. Pinned toolchain (do not bump casually)

These versions are pinned and verified in CI. Treat them as fixed unless you are doing an
intentional compatibility upgrade (see §10).

| Component | Pinned value |
| --- | --- |
| Node | `^22.19.0 \|\| >=24` |
| pnpm | `11.7.0` (activate via `corepack`) |
| DSH baseline | `0.1.1-rc.2` @ commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| Cordis | `4.0.1` |
| TypeScript | `^5.9` |
| Zod | `^4` (runtime validation backbone) |
| Build | `tsdown`; Tests `vitest@3`; Lint `eslint@9` + `typescript-eslint`; E2E `@playwright/test` |

- The single machine-readable DSH baseline is `scripts/dsh-baseline.json`. All
  `@deepseek-ai/dsh*` peer/dev dependencies must equal that version; this is enforced by
  `pnpm run verify:dsh-baseline` (`scripts/verify-dsh-baseline.mjs`), which also checks the
  lockfile and the Web E2E workflow.
- Host code consumes only **public DSH seams**: Cordis `Context`, Storage Domain, Host Web
  Server, tools, system prompt, agents, sessions, workspace registry, and user questions.

## 3. Repository layout

```
src/                  TypeScript Host source (compiled to lib/)
  index.ts            Cordis plugin entry: name/inject/apply; wires storage, tools, routes, events
  types.ts            ALL Zod schemas + inferred domain types (single source of truth)
  domain.ts           LearnLoopDomainError, Storage Domain spec, emptyState/ensureState
  workspace.ts        Aggregate commands (onboarding, profile, plan, task lifecycle, assessment)
  workspace-identity.ts  Canonical Workspace/Session resolution
  http.ts             HTTP v3 handler: routes, mutation schema, domain-error → status map
  tool.ts             learnloop_create_plan_draft tool
  assessment-tool.ts  learnloop_assess_answer tool
  interview-tool.ts   learnloop_ask_profile_question tool
  interview-probes.ts / profile-compiler.ts / plan-intent.ts   Interview + profile/plan compile
  tool-protocol.ts    Tool names, phase allow-list, error encoding (LEARNLOOP_TOOL_ERROR_V2)
  tool-restriction.ts LearnLoopToolRestrictions: per-agent tool deny-list enforcement
  prompt.ts           Session-scoped System Prompt section (phase policy, generation data)
  evidence-bridge.ts  Captures the pre-step user answer as an Evidence Candidate
  dsh-session-adapter.ts  Fail-closed reader for typed DSH Session events (provenance)
  content/            Content pipeline: capture, generation, document, repository, service,
                      schemas, markdown, hash, privacy, tool (learnloop_write_lesson_document)
  content/publish/    Export pipeline: exporter, markdown, html, pdf, epub
client/bundle.js      Prebuilt, dependency-free Web client (DSH loads it via __ModuleLoader__)
tests/                Vitest suites (*.spec.ts) mirroring src; content-fixture.ts helper
e2e/                  Playwright specs + fixtures (mock provider patch)
scripts/              Acceptance/verify scripts (cloud acceptance, keyless E2E, baseline verify)
docs/                 Bilingual (中文/English) design + acceptance docs
profiles/, cordis.patch.yml   DSH profile/bundle patch files (plugin discovery)
lib/                  Build output (gitignored; produced by `pnpm run build`)
```

`src/index.ts` re-exports the public surface of nearly every module; tests and external
consumers import from the package root (`../src/index.js` in tests).

## 4. Runtime architecture

LearnLoop is a **Cordis plugin**. `src/index.ts` exports `name = 'learnloop'`, an `inject`
list (`storageDomain`, `webServer`, `tools`, `systemPrompt`, `agents`, `sessions`,
`workspaceRegistry`, `userQuestions`), and `async apply(ctx)` which:

1. Opens the Storage Domain and ensures the singleton state row exists, then reconciles
   interrupted content jobs and pending profile questions.
2. Registers the four model tools, the session-scoped System Prompt section, and the HTTP
   routes (each via `ctx.effect`, so they are cleaned up on dispose).
3. Subscribes to DSH lifecycle events (`agent/pre-step`, `session/event`, `agent/created`,
   `agent/session-start`, `agent/disposed`, `tools/change`, `tools/result`) to capture
   answers, consume profile-fallback messages, and keep per-agent tool restrictions in sync.

The **Host is the sole authority over state.** Every mutation runs inside one atomic
Storage Domain `update`, checks a monotonic `revision`, and is idempotent via an
`idempotencyKey` recorded in `commandReceipts` (so a retried command replays its stored
result instead of re-executing).

## 5. Persistence & state model

- **Storage Domain** `learnloop`, version `11`, one table `state`, one row `singleton`.
- **State schema 14** (`learnLoopStateSchema` in `src/types.ts`): root is exactly
  `{ schemaVersion, revision, settings, workspaces, commandReceipts }`. All schemas use
  `.strict()`; unknown keys are rejected.
- **Hierarchy:** `workspaces[workspaceId]` → `projects[projectId]`. A **Project** is the
  aggregate that owns its profile, immutable plan versions, execution, evidence candidates,
  verified assessments/evidence, mastery, adjustments, misconceptions, review queue, and a
  content index. A **Session** is only the current execution attachment — changing sessions
  does not move or copy a project.
- **Content files:** private lesson source snapshots and canonical lesson documents are
  immutable, schema-validated JSON files stored under
  `$DSH_HOME/learnloop/content/ws-<hash>/project-<hash>` via `ContentRepository`. Main state
  stores only references, capture requests, generation jobs, and export records.
- **Backup format 8** (`BACKUP_FORMAT_VERSION` in `src/http.ts`) exports only the canonical
  Workspace aggregate plus current settings.

### Breaking epochs

Every state-schema epoch is a **clean break**: older persisted states and backup formats
are intentionally unsupported, with **no automatic migration, reset, or deletion**. When
you change the persisted shape, bump the state schema, Storage Domain version, and backup
format together, and record the epoch in `CHANGELOG.md`. See the README "Breaking upgrades"
section for the user-facing reset procedure.

## 6. HTTP API v3 (same-origin, loopback)

Routes are registered in `src/index.ts` and handled by `createLearnLoopHttpHandler` in
`src/http.ts`:

- `GET/POST /learnloop/api/v3/state` — Workspace-scoped state projection (GET); domain
  mutations (POST, a strict Zod discriminated union on `action`).
- `GET/POST /learnloop/api/v3/manage` — management projection and `update-settings` /
  `clear-project`.
- `GET /learnloop/api/v3/export` — owner backup download.
- `GET /learnloop/api/v3/lesson` — rendered article preview (HTML).
- `GET /learnloop/api/v3/export-file` — export ZIP download.

Conventions:

- Reads are scoped by `workspaceId`; the server returns a redacted projection to
  non-owner sessions. This is **local product-state isolation, not multi-user auth**.
- Mutations require canonical Workspace/Session ownership, an optimistic
  `expectedWorkspaceRevision` / root revision check, and an `idempotencyKey`. The product
  contract (see `docs/PRODUCT_CONTRACT.md`) requires same-origin, JSON content type, and a
  bounded request size; DSH Web binds loopback and serves the same-origin client.
- Errors are `LearnLoopDomainError` with a stable `code`; `statusByCode` maps codes to HTTP
  statuses (default `409`). Model/tool errors are encoded via `LEARNLOOP_SAFE_ERROR` /
  `LEARNLOOP_TOOL_ERROR_V2` so the model gets an actionable, non-leaking message.
- Preview/download routes resolve paths strictly within recorded Host-owned locations
  (`sepWithin`) to prevent path escape.

## 7. Agent / model protocol

Exactly four tools are registered globally (DSH rc.2 registers tools globally), so LearnLoop
publishes an exact **phase allow-list** in each System Prompt and independently enforces it
at the tool-executor/domain boundary (`tool-protocol.ts` + `tool-restriction.ts`):

- `learnloop_ask_profile_question` — ask the current Host-owned profile question (opaque token).
- `learnloop_create_plan_draft` — submit a minimal Plan Intent; the Host compiles IDs,
  dependencies, revisions, and status.
- `learnloop_assess_answer` — validate every acceptance criterion for the armed answer.
- `learnloop_write_lesson_document` — submit a structured `LessonDocumentIntent` (once per task).

Key flows:

- **Activation:** the only entry point is the UI's **Start learning mode** button → HTTP
  `begin-learning-mode` → an `interviewing` Project. No onboarding tool is exposed to the
  model.
- **Verified Answer Loop:** arming a task captures the next direct user message as an
  Evidence Candidate; `learnloop_assess_answer` must cover every criterion exactly once.
  `needs-work` keeps the task active and writes no Evidence; `passed`/`excellent`
  atomically writes Assessment + Evidence + Mastery + task completion + a durable lesson
  capture record. The next task still requires an explicit start.
- **Content pipeline:** `Plan → LessonSourceSnapshot → LessonDocument → Publication`.
  After a task passes, a capture request materializes a private, bounded snapshot (never the
  raw transcript or learner answers); the Host wakes the owning Agent; the model submits only
  a `LessonDocumentIntent`; the Host validates structure, Markdown safety, privacy, and
  reference-link provenance, then derives identity/sequence/slug/revision/provenance and
  stores the immutable document. Export writes Markdown, static HTML, PDF (local
  Chromium-family browser), EPUB, and a combined ZIP.
- **Reviews are Host-authoritative:** profile confirmation and plan approval are explicit
  UI/HTTP commands, not model tools. Plan approval activates the plan but leaves every task
  pending.

## 8. Build & test commands

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm run build         # tsdown → lib/ (ESM + d.ts + sourcemaps)
pnpm run typecheck     # tsc --noEmit
pnpm run lint          # eslint src tests --max-warnings 0
pnpm test              # vitest run (all tests/**/*.spec.ts)
pnpm run check         # typecheck + node --check client/bundle.js + test  (run before PR)
```

Focused suites (used by CI):

```bash
pnpm run test:unit               # tests/domain.spec.ts
pnpm run test:integration        # tests/http.spec.ts
pnpm run test:runtime            # assessment-tool + evidence-bridge + prompt
pnpm run test:evidence / test:assessment / test:prompt
pnpm run test:upstream-contract  # tests/upstream-contract.spec.ts
pnpm run verify:dsh-baseline     # pinned-DSH consistency across package.json/lockfile/CI
pnpm run verify:article-export   # real article + export artifacts in a temp dir
pnpm run package:validate        # npm pack --dry-run
```

Browser E2E and acceptance (keyless — they use a deterministic mock provider and never
touch real credentials):

```bash
pnpm run e2e:keyless:web         # orchestrates build + mock provider + dsh web + Playwright
pnpm run test:e2e                # Playwright against an already-running DSH Web
pnpm run acceptance:prepare      # isolated, keyless DSH Web profile (uses $DSH_HOME)
pnpm run acceptance:web          # start loopback DSH Web for acceptance
pnpm run acceptance:reset        # clean up the isolated acceptance profile
```

## 9. Testing strategy

- **Unit/integration:** Vitest (`tests/**/*.spec.ts`, V8 coverage). Suites mirror `src/`
  modules and construct state through the same aggregate commands the Host uses; shared
  helpers live in `tests/content-fixture.ts`. Tests import from the package root.
- **Contract tests:** `tests/upstream-contract.spec.ts` pins the public DSH tool/session
  surfaces LearnLoop relies on.
- **Browser E2E:** Playwright (`e2e/`), driven keylessly by `scripts/keyless-web-e2e.mjs`
  with the deterministic `scripts/learner-first-mock-provider.mjs`. Real DeepSeek endpoints
  are blocked; no key is ever present.
- **CI:** `.github/workflows/ci.yml` (build+typecheck, lint, unit-domain,
  unit-runtime-http-tool, full-suite with `check` + `package:validate`) and
  `.github/workflows/web-e2e.yml` (checks out the pinned DSH source, builds it, runs the
  keyless Web E2E, uploads reports on failure).
- **Cloud acceptance:** `scripts/cloud-acceptance-*.sh` plus `.devcontainer/` provide an
  isolated, repeatable environment (`DSH_HOME` isolation). Manual scenarios are in
  `docs/ACCEPTANCE_SCENARIOS.md`; live/billed behavior is user-opt-in and never a PR gate.

## 10. Code style & conventions

- **Language:** TypeScript, ESM, `module`/`moduleResolution: NodeNext`. Import local files
  with the `.js` extension (e.g. `from './domain.js'`).
- **Compiler is `strict: false`** (see `tsconfig.json`); **type safety is enforced at
  runtime by strict Zod schemas** instead. Preserve the `.strict()` schemas and validate at
  every boundary — do not loosen them, and prefer parsing over casting.
- **Formatting:** the codebase is densely written — **no semicolons**, compact arrow
  functions, minimal vertical whitespace, single-line expressions where readable. Match the
  surrounding style; do not reformat existing code.
- **Lint:** only `no-constant-condition` is enabled as an error, with `--max-warnings 0`.
- **Immutability:** domain commands return new state objects (spread/map), never mutate in
  place; plans are immutable versions (revert uses inverse operations).
- **Errors:** throw `LearnLoopDomainError` with a stable `LearnLoopErrorCode`; keep the
  code list in `src/types.ts` and the `statusByCode` map in `src/http.ts` in sync.
- **Language of artifacts:** code comments and identifiers are English. User-facing web
  copy and many docs/CHANGELOG entries are **bilingual (简体中文 / English)** — keep that
  pairing when you touch UI strings or documentation.

## 11. Security & privacy considerations

- **Never handle credentials.** No code may read, store, log, or transmit model API keys.
  Automated tests and E2E are entirely keyless.
- **Content privacy:** a deterministic Host scanner (`src/content/privacy.ts`) rejects any
  generated article containing internal identifiers (workspace/project/session/message/lesson
  ids), Host control markers, API-key shapes, or absolute local paths. The model's own
  redaction is not trusted. Reference links are accepted only if the URL literally appears in
  the captured teaching content.
- **Snapshots are bounded:** they retain only explicitly bounded assistant text and accepted
  assessment/evidence facts — never raw transcripts, learner answers, system prompts, tool
  payloads, credentials, or local paths.
- **Path containment:** preview/export/download resolve strictly within recorded Host-owned
  directories (`sepWithin`, `contentProjectRoot`).
- **Exports are sensitive:** backups and exported articles contain learning data; treat them
  as sensitive.
- **HTTP boundary:** same-origin, strict runtime schemas, bounded request size, monotonic
  revision checks, and idempotent receipts. Foreign sessions receive a redacted projection.

## 12. Install & run (for manual verification)

```bash
pnpm install --frozen-lockfile && pnpm run build
dsh plugin --profile web add .   # register the plugin into the DSH web profile
dsh web                          # start DSH Web, then use "Start learning mode" in the UI
```

Use the isolated acceptance flow (`pnpm run acceptance:prepare` / `acceptance:web`) for a
clean, keyless environment instead of your real `DSH_HOME`.

## 13. When you change things

- Changing the **persisted shape** → bump state schema + Storage Domain version + backup
  format together and log a new breaking epoch in `CHANGELOG.md`. No migrations.
- Changing the **DSH baseline** → update `scripts/dsh-baseline.json` and every
  `@deepseek-ai/dsh*` pin, then rerun build, typecheck, lint, the full test suite, and the
  real Web acceptance. Keep `docs/UPSTREAM_COMPATIBILITY.md` and `docs/DSH_BASELINE.md`
  current.
- Adding a **tool** → register it in `src/index.ts`, add its name and phase contract in
  `src/tool-protocol.ts`, and cover it with schema + recovery tests.
- Editing **UI copy or docs** → preserve the 中文/English bilingual pairing.
- Keep `README.md`, `docs/`, and this file accurate as behavior evolves.
