# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read `AGENTS.md` first — it is the architecture source of truth

`AGENTS.md` in this repo root is already loaded as project instructions and covers the domain
model, the ownership boundary, the persistence epochs, the HTTP v3 contract, the model/tool
protocol, and the change procedures (state-schema bumps, DSH baseline moves, adding a tool).
**Do not restate it here and do not duplicate it into this file** — this file only adds the
operational detail `AGENTS.md` leaves out. If the two disagree, `AGENTS.md` wins, and the
strict Zod schemas in `src/types.ts` beat both.

## Commands

`AGENTS.md` §8 lists the aggregate suites. The forms it omits, which are what you actually
reach for while iterating:

```bash
pnpm vitest run tests/domain.spec.ts          # one spec file
pnpm vitest run tests/domain.spec.ts -t "clearProject"   # one `it` by name
pnpm vitest                                    # watch mode
pnpm vitest run tests/http.spec.ts -t "idempot"  # spec + name filter combine
```

Run `pnpm run check` (typecheck + `node --check client/bundle.js` + full vitest) before
opening a PR — that is exactly what CI's `full-suite` job runs, minus `package:validate`.

Local toolchain is pinned: Node `^22.19.0 || >=24`, pnpm `11.7.0` via `corepack enable`.
`scripts/dsh-baseline.json` is the single machine-readable DSH baseline; `pnpm run
verify:dsh-baseline` is a real CI gate, not advisory, and fails when the `./deepseek-harness`
checkout drifts from the recorded commit.

## `client/bundle.js` has no build step — treat it as source

`AGENTS.md` calls it "prebuilt", which can send you hunting for a compiler. There isn't one.
It is a hand-authored, tracked, dependency-free file that DSH loads directly through
`window.__ModuleLoader__`. Consequences:

- Editing it means editing it directly — no `pnpm run build` regenerates it. `pnpm run build`
  (tsdown) only compiles `src/index.ts` → `lib/`.
- It is tested as-is: `tests/upstream-contract.spec.ts` and `tests/primary-action.spec.ts` run
  the file inside a `node:vm` sandbox with a stubbed loader and assert on the exported
  `__test` surface. Client behavior changes belong in those specs.
- `pnpm run check` syntax-checks it with `node --check`; that is the only static gate it gets.
  It is not in the `eslint` or `tsc` scope (`tsconfig.json` includes only `src/**/*.ts`).
- `tests/upstream-contract.spec.ts` asserts the bundle literally contains the DSH client slot
  seams (`conversation.input.left`, `sidebar.footer.action`, `conversation.view`,
  `settings.section`, `inputActions.submit`). Renaming a seam in the client breaks the pin.

## Test conventions

- Specs live in `tests/**/*.spec.ts` and import from the package root — `../src/index.js`,
  which re-exports nearly every module (`src/index.ts`). Import there, not from deep module
  paths, so tests exercise the same surface external consumers see.
- State in tests is built by calling the same aggregate commands the Host uses
  (`beginWorkspaceOnboarding`, `commitWorkspaceProfile`, `approveWorkspacePlan`, …), never by
  hand-writing a state literal. Shared construction helpers are in `tests/content-fixture.ts`.
- Match the surrounding style: dense, semicolon-free, long single-line `it` bodies with no
  vertical padding. Do not reformat these files. (`AGENTS.md` §10 has the full convention,
  including the `.js` extension on local imports and `strict: false` + Zod-at-the-boundary.)
- `vitest.config.ts` includes only `tests/**/*.spec.ts`; `e2e/` is Playwright's and is not
  picked up by `pnpm test`.

## The keyless E2E is fully self-orchestrating

`pnpm run e2e:keyless:web` (`scripts/keyless-web-e2e.mjs`) does not need a running server. It
allocates free ports, prepares an isolated `DSH_HOME` under a temp dir, starts a deterministic
mock provider, boots `dsh web` with a provider patch, scrapes the `?token=` URL from the web
log, runs Playwright against it, and tears everything down. Real `api.deepseek.com` is blocked
in CI via `/etc/hosts`.

`pnpm run test:e2e` is the *other* half — Playwright against an already-running DSH Web,
reading `DSH_WEB_URL` (default `http://127.0.0.1:3080`). Use `e2e:keyless:web` for a
self-contained run.

Two things that make this painful to debug: failures land in `mock-provider.log` and
`dsh-web.log` in the repo root (gitignored), and the PDF/EPUB export assertions need CJK fonts
installed — CI installs `fonts-noto-cjk` for exactly this reason, so a missing-font failure
locally is an environment problem, not a code problem.

## After editing

- `src/**` changed → `pnpm run build`, then restart `dsh web`. The web profile links the plugin
  in place (the `link:` dependency family), so there is nothing to reinstall or re-register.
- `client/bundle.js` changed → reload the browser page.
- Dependency changes → `pnpm install`.
- `./deepseek-harness` moved forward → rebuild it, then `pnpm run verify:dsh-baseline`; bump
  `scripts/dsh-baseline.json` if it drifted. Procedure is in `AGENTS.md` §13.
