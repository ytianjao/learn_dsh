# LearnLoop for DeepSeek Harness

LearnLoop is a local-first long-term learning companion installed into the DeepSeek Harness Web profile. Users create a learning project, chat through DSH, inspect evidence-based progress, review plans, and approve significant changes entirely in the browser.

## Requirements

- DSH `0.1.0-rc.8` at baseline commit `141eb6fef83422698aef7a981029e843e8161534`
- Node `^22.19` or `>=24`
- A supported browser

A DeepSeek API key is **not** required for install, build, keyless tests, plan/progress use, replay or package validation. For live conversation, configure the key only in **DSH Settings → Models**. LearnLoop never receives it.

## Install and start

```bash
npm install
npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
dsh web
```

Open the URL printed by DSH. The Web profile discovers both the Host plugin and `./client` module. For a named profile assembled manually, apply `profiles/learnloop.patch.yml` after the DSH base and Web App layers.

## Use in the browser

1. Keep the default **对话** tab open. In the LearnLoop dock, describe what you want to learn, your experience, weekly time and desired outcome, then choose **开始学习**.
2. Continue ordinary natural-language conversation in the DSH composer. Configure/select DeepSeek through DSH's model UI when live teaching is needed.
3. Use **学习计划** to inspect stages, acceptance criteria, current task, versions and adjustment diffs.
4. Use **学习进度** to inspect discrete mastery levels and expand why each conclusion was reached.
5. Use **复盘** for persisted evidence, changes and the next start point.
6. Expand **当前任务** above the composer to continue, inspect acceptance criteria, block/skip, or complete with your own evidence.
7. Open **Settings → LearnLoop** to set language, weekly hours, strictness and automation preferences. Export/backup and explicit reset are there as well.

LearnLoop intentionally does not use slash commands. Clicking completion does not prove mastery; submit an explanation, implementation or assessment result.

## Backup and restore

Choose **导出 / 备份** in LearnLoop settings to download the Host projection. DSH's storage-domain files remain under DSH Home and survive browser refresh and Host restart. Do not edit storage files by hand. Use the DSH Home backup procedure to restore the complete local database; the JSON export is a portable audit copy in v1.

## Upgrade

```bash
npm install
dsh plugin --profile web remove @learnloop/dsh-learnloop
dsh plugin --profile web add .
npm run test:compat
```

Restart DSH and verify Plan, Progress and Review before continuing. See `docs/UPSTREAM_COMPATIBILITY.md` before changing the DSH baseline.

## Uninstall

Export data first if needed, then run:

```bash
dsh plugin --profile web remove @learnloop/dsh-learnloop
```

Restart DSH. Uninstalling the plugin does not delete DSH model credentials. Use the confirmed reset action in LearnLoop settings before uninstalling only when LearnLoop learning data must also be removed.

## Development and checks

```bash
npm install --legacy-peer-deps
npm run build
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:compat
npm test
npm run test:e2e
npm run package:validate
```

Browser E2E expects an already-running fixture DSH Web profile at `DSH_WEB_URL` (default `http://127.0.0.1:3080`). No routine command calls a model provider.

Architecture and acceptance references: `docs/DSH_BASELINE.md`, `docs/PRODUCT_CONTRACT.md`, `docs/WEB_ACCEPTANCE.md`, and `docs/UPSTREAM_COMPATIBILITY.md`.
