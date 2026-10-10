# AGENTS.md — LearnLoop for DeepSeek Harness

LearnLoop (`@learnloop/dsh-learnloop`) is a local-first learning companion shipped as a plugin
for DeepSeek Harness (DSH) Web. One npm package holds a Cordis **Host plugin** (`src/` → `lib/`)
and a dependency-free **Web client** (`client/bundle.js`).

This file holds the rules that keep a change safe. Feature behavior lives in `docs/`; versions
live in the files that own them. Do not copy either into this file — copies go stale.

## Where to look

| Question | Source of truth |
| --- | --- |
| Persisted shape, domain types, error codes | `src/types.ts` (strict Zod; beats every doc) |
| Persistence epoch (state schema / Storage Domain / backup format) | `tests/persistence-epoch.spec.ts` pins all three; history in `CHANGELOG.md` |
| DSH baseline version and commit | `scripts/dsh-baseline.json`; rationale in `docs/DSH_BASELINE.md`, `docs/UPSTREAM_COMPATIBILITY.md` |
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
- **Tool access is phase-gated twice.** DSH registers tools globally, so every System Prompt
  publishes an exact phase allow-list, and `src/tool-protocol.ts` + `src/tool-restriction.ts`
  enforce it again at the executor. Domain phase guards remain authoritative.
- **Model output is untrusted.** Generated articles pass the deterministic scanner in
  `src/content/privacy.ts`; the model's own redaction is not trusted. Lesson source snapshots
  are bounded — never raw transcripts, learner answers, system prompts, tool payloads,
  credentials, or local paths.
- **Strict Zod at every boundary.** `tsconfig.json` is `strict: false`; type safety comes from
  `.strict()` Zod schemas at runtime. Do not loosen them; parse, don't cast.
- **Persistence epochs are clean breaks.** Older states and backups are rejected. There is no
  migration, compatibility alias, or automatic reset or deletion.
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
pnpm run verify:dsh-baseline  # CI gate: peer strings, link targets, checkout drift, lockfile
pnpm run e2e:keyless:web      # self-contained browser E2E against a deterministic mock provider
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
- **DSH baseline** → pull `./deepseek-harness` forward and rebuild it
  (`pnpm --dir deepseek-harness install && pnpm --dir deepseek-harness run build`); update
  `scripts/dsh-baseline.json` and the `@deepseek-ai/dsh*` peer strings; `pnpm install`; then
  build, lint, `check`, `verify:dsh-baseline`, and the real Web acceptance. Keep
  `docs/DSH_BASELINE.md` and `docs/UPSTREAM_COMPATIBILITY.md` current.
- **New tool** → register it in `src/index.ts`, add its name and phase contract to
  `src/tool-protocol.ts`, and cover its schema and recovery paths with tests.
- **New error code** → add it to `LearnLoopErrorCode`, map its HTTP status in `statusByCode`
  (default `409`), and classify its recovery in `src/tool-protocol.ts`. Unclassified codes fall
  back to `do-not-retry`, which strands the model on errors it could repair.
- **Behavior** → update the matching `docs/` file and `CHANGELOG.md`. This file changes only
  when a rule or a change procedure does.
