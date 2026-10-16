# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## `AGENTS.md` is the architecture source of truth

@AGENTS.md

The import above loads `AGENTS.md` with this file. It covers the invariants, a code map, the
commands, the code style, the change procedures, and a table pointing to the `docs/` file for
each feature. **Do not restate it here** — this file only adds the operational detail
`AGENTS.md` leaves out. If the two disagree, `AGENTS.md` wins, and the strict Zod schemas in
`src/types.ts` beat both.

## Commands

The forms `AGENTS.md` and `package.json` do not show, which are what you actually reach for
while iterating. Every one of them runs **inside the sbx sandbox**, because that is where the
dependencies are — the host keeps no `node_modules`. Prefix them at the host with
`sbx exec my-sandbox bash -lc 'cd /d/code/learn_dsh && CI=true …'`, or `cd` there first if you
are already inside the sandbox:

```bash
pnpm vitest run tests/domain.spec.ts          # one spec file
pnpm vitest run tests/domain.spec.ts -t "clearProject"   # one `it` by name
pnpm vitest                                    # watch mode
pnpm vitest run tests/http.spec.ts -t "idempot"  # spec + name filter combine
```

`pnpm run check` is exactly what CI's `full-suite` job runs, minus `package:validate`.

## `client/bundle.js` — generated artifact

`client/bundle.js` is built from `client/src/*.js` source modules by `scripts/build-client.mjs`.
Edit the source modules, then run:

```bash
pnpm run build:client   # rebuilds client/bundle.js from client/src/
pnpm run check          # typecheck + rebuild + drift check + vitest
```

`pnpm run check` includes `git diff --exit-code client/bundle.js`; a committed bundle that
doesn't match its sources fails CI. Never edit `client/bundle.js` directly — edit the source
module it belongs to and rebuild.

The split into numbered modules (`00-constants`, `01-store`, …, `10-plugin`) mirrors the
original single-file order. The builder concatenates them in alphabetical order inside the
factory IIFE wrapper.

DSH loads it through `window.__ModuleLoader__`. What that means for testing it:

- It is tested as-is: `tests/upstream-contract.spec.ts` and `tests/primary-action.spec.ts` run
  the file inside a `node:vm` sandbox with a stubbed loader and assert on the exported
  `__test` surface. Client behavior changes belong in those specs.
- `pnpm run check` syntax-checks it with `node --check`; that is the only static gate it gets.
  It is not in the `eslint` or `tsc` scope (`tsconfig.json` includes only `src/**/*.ts`).
- `tests/upstream-contract.spec.ts` asserts the bundle literally contains the DSH client slot
  seams (`conversation.input.left`, `sidebar.footer.action`, `conversation.view`,
  `settings.section`, `inputActions.submit`). Renaming a seam in the client breaks the pin.

## Test files

- Spec bodies are long single-line `it` blocks with no vertical padding; keep them that way.
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

Follow README "After editing / 修改后更新" to get a change into a running `dsh web`.
