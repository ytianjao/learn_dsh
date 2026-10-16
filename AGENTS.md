# AGENTS.md — LearnLoop for DeepSeek Harness

LearnLoop (`@learnloop/dsh-learnloop`) is a local-first learning companion shipped as a plugin
for DeepSeek Harness (DSH) Web. One npm package holds a Cordis **Host plugin** (`src/` → `lib/`)
and a dependency-free **Web client** (`client/bundle.js`).

The Harness is installed from the npm registry: there is no source checkout on disk. The
`@deepseek-ai/*` devDependencies are registry ranges, and at runtime the plugin uses whichever
`dsh` loads it (README). The Host's own module-resolution interception routes a linked plugin's
bare `@deepseek-ai/*` imports to the launching installation, so plugin and Host share one
physical module copy — which is why a registry install is safe here.

This file holds the rules that keep a change safe. Feature behavior lives in `docs/`; versions
live in the files that own them. Do not copy either into this file — copies go stale.

## Where to look

| Question | Source of truth |
| --- | --- |
| Persisted shape, domain types, error codes | `src/types.ts` (strict Zod; beats every doc) |
| Persistence epoch (state schema / Storage Domain / backup format) | `tests/persistence-epoch.spec.ts` pins all three; history in `CHANGELOG.md` |
| DSH compatibility (peer ranges vs the installed Harness) | `pnpm run verify:dsh-compat`; rationale in `docs/DSH_BASELINE.md`, `docs/UPSTREAM_COMPATIBILITY.md` |
| Toolchain pins | `package.json` (`engines`, `packageManager`, `peerDependencies`) |
| Product rules, activation, verified answers | `docs/PRODUCT_CONTRACT.md` |
| Profile interview | `docs/PROFILE_INTERVIEW.md` |
| Profile confirmation and plan approval | `docs/HOST_AUTHORITATIVE_REVIEWS.md` |
| Plan adjustment | `docs/PLAN_ADJUSTMENT.md` |
| Lesson articles and export | `docs/CONTENT_MODEL.md`, `docs/CONTENT_GENERATION.md`, `docs/CONTENT_REPOSITORY.md`, `docs/PRIVACY_AND_SHARING.md` |
| Acceptance | `docs/CLOUD_ACCEPTANCE.md`, `docs/WEB_ACCEPTANCE.md`, `docs/ACCEPTANCE_SCENARIOS.md` |
| Install, run, reset after a breaking epoch | `README.md` |

## Invariants

Breaking one of these is a design change, not a refactor.

- **DSH owns the model; LearnLoop owns learning facts.** DSH owns sessions, streaming Chat,
  model routing, tool execution, and all credentials. LearnLoop never reads, stores, logs, or
  transmits API keys, never implements a provider client, and never calls a provider; the model
  acts only through LearnLoop tools inside the ordinary DSH Agent Loop. Tests, E2E, and CI are
  keyless; live, billed runs are user opt-in and never a PR gate.
- **Public DSH seams only.** The Host uses the Cordis services named in `inject` in
  `src/index.ts`; the client uses DSH Web slots. Nothing reaches into DSH internals.
- **The Host is the sole authority over state.** Every mutation is one atomic Storage Domain
  `update` that checks a monotonic `revision` and carries an `idempotencyKey` recorded in
  `commandReceipts`, so a retry replays the stored result instead of re-executing. Commands
  return new objects and never mutate in place; plan versions are immutable.
- **The model proposes, the Host compiles.** Tools accept minimal intents; the Host derives IDs,
  dependencies, revisions, statuses, and provenance. Learner decisions — starting learning
  mode, confirming a profile, approving a plan, approving or discarding a plan adjustment,
  starting a task — are UI/HTTP commands, never model tools. Nothing is replaced silently.
- **Tool access is phase-gated twice, without hiding tools.** The runtime state publishes the exact
  phase allow-list, and the executor guard in `src/tool-restriction.ts` rejects any other LearnLoop
  tool before it runs; domain phase guards remain authoritative. A learning session declares every
  LearnLoop tool for its whole life: toggling declarations per phase rewrote the provider's tool list
  and broke its prefix cache.
- **The system section is static; changing state is runtime context.** DSH appends a changed system
  prompt to the cached history, so `renderLearnLoopSystemSection` must not vary within a learning
  session. Phase, allow-list, and phase data go to `renderLearnLoopRuntimeContext`
  (`systemPrompt.context`), which DSH re-appends only when its text changes: keep it to what the
  phase needs and free of per-step values. Data a turn rarely needs is a read tool, not context.
- **Model output is untrusted.** Generated articles pass the deterministic scanner in
  `src/content/privacy.ts`; the model's own redaction is not trusted. Lesson source snapshots
  are bounded — never raw transcripts, learner answers, system prompts, tool payloads,
  credentials, or local paths.
- **Strict Zod at every boundary.** `tsconfig.json` is `strict: false`; type safety comes from
  `.strict()` Zod schemas at runtime. Do not loosen them; parse, don't cast.
- **Persistence epochs are clean breaks.** Older states and backups are rejected. There is no
  migration, compatibility alias, or automatic reset or deletion. A stale stored state must not
  stop `dsh web`: `src/storage-recovery.ts` starts LearnLoop degraded, and only the learner's
  explicit reset moves the file aside to `learnloop/stale-backups/`. That reset is the one place
  LearnLoop touches the DSH storage file directly (DSH has no public API to drop a unit).
- **HTTP v3 is local isolation, not auth.** It is same-origin over loopback; reads are
  Workspace-scoped and foreign sessions get a redacted projection. Routes that serve files
  resolve strictly inside Host-owned roots (`sepWithin`, `contentProjectRoot`).

## Code map

Only what file names do not tell you:

- `src/index.ts` — the Cordis plugin (`name`, `inject`, `apply`) and the public re-export
  surface. Tests and consumers import from here.
- `src/types.ts` — every Zod schema, inferred type, and `LearnLoopErrorCode`.
- `src/workspace.ts` — barrel over `src/commands/*`, the aggregate commands split by
  namespace. `src/commands/bus.ts` is the atomic command bus (receipts, revision CAS, events).
- `src/http.ts` — the v3 handler: mutation union on `action`, `statusByCode`,
  `BACKUP_FORMAT_VERSION`.
- `src/tool-protocol.ts` — tool names, phase contracts, and the error-code → recovery mapping
  the model sees.
- `src/interview-probes.ts`, `src/interview-answer.ts` — the Host-defined interview spec (kind,
  cardinality, option codes) and the pure pipeline that reads answers into codes and validates
  model enhancements. A model that sends only the token must still complete the interview.
- `src/evidence-bridge.ts`, `src/dsh-session-adapter.ts` — capture the learner's answer from
  DSH events and check its provenance, fail-closed.
- `src/content/` — the lesson pipeline; `publish/` holds the exporters.
- `client/bundle.js` — hand-authored source with no build step; edit it directly. Specs run it
  in a `node:vm` sandbox.

## Commands

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm run build                # tsdown: src/ → lib/ (never touches client/bundle.js)
pnpm run lint                 # eslint src tests --max-warnings 0
pnpm run check                # typecheck + node --check client/bundle.js + vitest; run before a PR
pnpm run verify:dsh-compat    # CI gate: peer ranges against the installed Harness, registry-only resolution
pnpm run e2e:keyless:web      # self-contained browser E2E against a deterministic mock provider
pnpm run dshweb               # build the plugin and serve it from `dsh web` inside the sbx sandbox (README)
```

Focused suites and acceptance scripts are in `package.json` `scripts`; CI jobs are in
`.github/workflows/`.

## Code style

- TypeScript ESM with `NodeNext`; local imports carry the `.js` extension.
- Dense: no semicolons, compact arrow functions, minimal vertical whitespace. Match the
  surrounding code and never reformat existing code.
- Throw `LearnLoopDomainError` with a stable `LearnLoopErrorCode`.
- Code comments and identifiers are English. UI copy, docs, and CHANGELOG entries are bilingual
  (简体中文 / English); keep the pairing.
- Tests build state through the same aggregate commands the Host uses, never hand-written state
  literals; shared helpers are in `tests/content-fixture.ts`.

## When you change things

- **Persisted shape** → bump the state schema (`src/types.ts`), the Storage Domain version
  (`src/domain.ts`), and `BACKUP_FORMAT_VERSION` (`src/http.ts`) together; update
  `tests/persistence-epoch.spec.ts`; record the breaking epoch in `CHANGELOG.md` and on the
  README "Current epoch" line. No migrations.
- **DSH upgrade** → DSH comes from npm; bump the `@deepseek-ai/dsh*` and `@deepseek-ai/cordis`
  devDependency and peer ranges in `package.json`, then `pnpm install`; run build, lint, `check`,
  `verify:dsh-compat`, and the real Web acceptance. Keep the ranges floating so an upgrade inside
  the minor line needs no code change; when the Harness moves to a new major line, adjust our own
  code to the new seam rather than pinning back. Keep `docs/DSH_BASELINE.md` and
  `docs/UPSTREAM_COMPATIBILITY.md` current.
- **New tool** → register it in `src/index.ts`, add its name and phase contract to
  `src/tool-protocol.ts`, and cover its schema and recovery paths with tests.
- **Interview Probe or option code** → change `INTERVIEW_PROBES` (including its `presence`), the
  projection in `src/profile-compiler.ts`, and the rows and edit specs in `src/profile-view.ts`
  together; keep the null-model baseline short; keep
  `tests/interview-pipeline.spec.ts` passing (the noisy model must reproduce the null-model
  Profile) and update `docs/PROFILE_INTERVIEW.md`. A persisted-shape change is a new epoch.
- **New error code** → add it to `LearnLoopErrorCode`, map its HTTP status in `statusByCode`
  (default `409`), and classify its recovery in `src/tool-protocol.ts`. Unclassified codes fall
  back to `do-not-retry`, which strands the model on errors it could repair.
- **Behavior** → update the matching `docs/` file and `CHANGELOG.md`. This file changes only
  when a rule or a change procedure does.
