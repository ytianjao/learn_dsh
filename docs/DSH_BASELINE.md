# DSH baseline

## Pin

LearnLoop pins DeepSeek Harness `dsh-v0.1.0-rc.8`, Git commit `141eb6fef83422698aef7a981029e843e8161534`, retrieved from `https://github.com/deepseek-ai/deepseek-harness`. The published CLI and package family are prereleases. The supported engine is Node `^22.19 || >=24`; DSH uses pnpm workspaces, while this tree-out plugin uses npm for a reproducible standalone install.

The baseline research covered the root and Client instructions, architecture and development references, the extension/package/conversation-node/settings cookbooks, Client README, and the official Web Bundle, `ui-conversation`, `ui-goal`, `ui-trajectory`, settings, storage-domain and Web server implementations.

## Public seams used

| Seam | LearnLoop use |
| --- | --- |
| Loader bundle patch | `cordis.patch.yml` mounts the Host package without a core fork. |
| `dsh.client` and `./client` | DSH discovers the prebuilt browser Client Module. |
| `ctx.storageDomain.open` | Versioned local facts under DSH Home; no browser fact store. |
| `ctx.webServer.register` | One exact, same-origin JSON endpoint for whole-value reads and CAS mutations. |
| `conversation.view` | Plan, Progress and Review tabs. |
| `conversation.input.dock` | Onboarding and the current task above the DSH composer. |
| `settings.section` | LearnLoop preferences, export, backup and explicit data reset. |
| DSH Chat and model selection | Streaming conversation and the user-selected provider remain entirely Host-owned. |

The client reads a Host-computed whole value. Writes include the last observed revision and stale writes receive HTTP 409. Durable facts, mastery explanations, next action and plan versions are calculated on the Host.

## Packaging

DSH installs the tree-out package with `dsh plugin --profile web add <path-or-package>`. The package's `dsh.bundle.patch` contributes its Host Loader row and `dsh.client.platform=web` exposes `./client`. `profiles/learnloop.patch.yml` is the explicit dedicated-profile patch for installations that compose profiles manually.

## Compatibility boundary

DSH-specific calls exist only in `src/index.ts`, `src/http.ts`, `cordis.patch.yml`, and the prebuilt `client/bundle.js`. Domain functions have no DSH runtime dependency. `tests/compatibility.spec.ts` locks package versions and every slot name. Run it and browser E2E before changing the pin.

The upstream client-bundle preset is not published at this baseline. LearnLoop therefore carries the minimal tested lazy-CJS `window.__ModuleLoader__.load` artifact. This is the largest breakage risk. Slot names, Loader artifact format, Web server registration and storage-domain table behavior are prerelease APIs.

LearnLoop must not modify DSH Agent Loop, Web Shell, central Chat renderer, provider/credential packages, Session log format, or official UI packages. It does not implement a DeepSeek HTTP client and does not accept, store, export or log an API key.
