# LearnLoop for DeepSeek Harness

LearnLoop is a local-first, long-term learning companion for DeepSeek Harness (DSH) Web: a guided profile interview, a validated learning plan, task-by-task teaching with verified answers, mastery tracking, and lesson article generation/export. It follows the latest DSH source checkout (`scripts/dsh-baseline.json`, currently `0.2.1-alpha.1`) and never reads or manages model credentials.

## Requirements

- Node `^22.19.0 || >=24`, pnpm `11.7.0` (via `corepack enable`)
- The DeepSeek Harness source, cloned and built **beside this repo** at `../deepseek-harness` (for example `D:\code\learn_dsh` next to `D:\code\deepseek-harness`). That one build is both your `dsh` command and what this repo's `@deepseek-ai/*` devDependencies link to for build and tests, so **no DSH package is ever installed from npm**. / Harness 源码需克隆并构建在**本仓库同级目录** `../deepseek-harness`。这一份构建既是 `dsh` 命令，也是本仓库 `@deepseek-ai/*` 开发依赖在构建与测试时链接的对象，**不会从 npm 安装任何 DSH 包**。

## Install from zero / 从零安装

Run from this repo's root. / 在本仓库根目录执行。

```bash
# 1. Build the Harness from source beside this repo (skip the clone if it already exists)
#    在本仓库同级目录从源码构建 Harness（已有源码则跳过 clone）
git clone https://github.com/deepseek-ai/deepseek-harness.git ../deepseek-harness
git -C ../deepseek-harness checkout $(node -p "require('./scripts/dsh-baseline.json').commit")
pnpm --dir ../deepseek-harness install && pnpm --dir ../deepseek-harness run build

# 2. Make that build your `dsh` command — a link to the checkout, nothing is downloaded
#    把这份本地构建设为 `dsh` 命令——只链接到源码，不下载任何东西
pnpm add -g ../deepseek-harness/apps/cli

# 3. Install and build the plugin, then confirm every DSH package is the sibling checkout
#    安装并构建插件，并确认所有 DSH 包都来自同级源码
pnpm install --frozen-lockfile && pnpm run build
pnpm run verify:dsh-baseline

# 4. Install the plugin from this repo, then start DSH from a separate study folder
#    在本仓库安装插件，再到单独的学习目录启动 DSH
dsh plugin --profile web add .
mkdir -p ../learnloop-study && cd ../learnloop-study
dsh web        # open the printed http://127.0.0.1:3080/?token=... URL / 打开打印的带 token 的地址
```

Start `dsh web` outside this repo: DSH uses the launch directory as the session workspace, so a session started here would read this repo's `AGENTS.md` and could edit the plugin source. / 不要在本仓库里启动 `dsh web`：DSH 以启动目录作为会话工作区，在这里启动会让学习会话读到本仓库的 `AGENTS.md`，并能改写插件源码。

Then click **开启学习模式 / Start learning mode** in the UI. If step 2 reports that the global bin directory is not in PATH, run `pnpm setup` once and open a new terminal. / 若第 2 步提示全局 bin 目录不在 PATH 中，先执行一次 `pnpm setup` 并重开终端。

Keep it local / 只用本地构建：

- Step 2 is idempotent; re-run it whenever you are unsure — it prints `<- ..\deepseek-harness\apps\cli` when `dsh` is your local build. / 第 2 步可重复执行；不确定时重跑一次，输出 `<- ..\deepseek-harness\apps\cli` 即表示 `dsh` 是本地构建。
- Never `npx @deepseek-ai/dsh` (the Harness README's "Run from npm"), `npm i -g @deepseek-ai/dsh`, or `pnpm add -g @deepseek-ai/dsh` by name — each downloads the published release, and the last one replaces your link. / 不要执行 `npx @deepseek-ai/dsh`（Harness README 的 "Run from npm"）、`npm i -g @deepseek-ai/dsh` 或按包名 `pnpm add -g @deepseek-ai/dsh`——它们都会下载 npm 发布版，最后一个还会覆盖本地链接。
- Never `dsh plugin add` an `@deepseek-ai/*` name — pnpm would fetch it from npm. The DSH bundles a profile lists already resolve from your local build. / 不要用 `dsh plugin add` 添加任何 `@deepseek-ai/*` 包名，否则 pnpm 会从 npm 拉取；profile 中列出的 DSH bundle 本就从本地构建解析。

## Verify

```bash
pnpm run check                # typecheck + client syntax + all tests
pnpm run lint
pnpm run verify:dsh-baseline  # peer strings, link targets, checkout drift, lockfile, workflow
pnpm run e2e:keyless:web      # full browser flow against a deterministic mock provider
MOCK_MODEL_POLICY=null pnpm run e2e:keyless:web   # the same flow with a "null model" that sends only the question token
```

## After editing / 修改后更新

- `src/**`: `pnpm run build`, then restart `dsh web` — the profile links the plugin in place, so there is nothing to reinstall or re-register. / 改源码后重新构建并重启服务即可，链接都是活路径，无需重装或重新注册。
- `client/bundle.js`: reload the browser page. / 改客户端 bundle 后刷新页面。
- Dependency changes: `pnpm install`. / 依赖变更后重新 install。
- `../deepseek-harness` changed: `pnpm --dir ../deepseek-harness run build` — `dsh` links to that checkout, so there is nothing to reinstall — then `pnpm run verify:dsh-baseline` (bump `scripts/dsh-baseline.json` on drift, see "When you change things" in `AGENTS.md`). / Harness 源码变更后重新构建即可（`dsh` 直接链接到该检出，无需重装），再校验基线。

## Use

- **Interview:** a short baseline — what you want to learn, how far, what you have tried, how you want to learn, and your weekly time (plus practice limits if you want hands-on practice). Every question is defined by LearnLoop, single- or multi-select as it should be, and custom text always remains valid. The model may add a relevant optional question (such as a deadline when you mention an exam), reword questions for your subject, or assume an answer you already made clear — all of it is flagged in the LearnLoop Profile view, where you can edit any field, fill in ones that were not asked, and confirm. / 访谈只有一个很短的基线：想学什么、学到什么程度、接触过什么、想怎么学、每周时间（选择动手练习时再问练习限制）。每道题都由 LearnLoop 定义，该多选的就是多选，也始终可以自己输入。模型可以按需追加相关的可选题（例如你提到考试时追问期限）、按你的主题改写题目，或推断你已说清的答案——这些都会在学习档案审阅页中标注；你可以在审阅页修改任一字段、补充未询问的内容，再确认档案。
- **Plan and tasks:** review and approve the draft plan, then start each task explicitly. A formal check captures the next learner answer and validates every acceptance criterion; passing writes assessment, evidence, and mastery atomically.
- **Articles:** after a task passes, generate a lesson article from the Plan view and export Markdown, a static HTML site, PDF, EPUB, or a combined ZIP.

Design, protocol, and acceptance details live in `docs/` and `AGENTS.md`; state-schema epochs and their reset procedure are recorded in `CHANGELOG.md`.

## Breaking upgrades / 破坏性升级

Every persisted-shape change raises the state schema, the Storage Domain version, and the backup
format together and forms a **clean break**. There is **no migration, no compatibility alias, and no
legacy import** — an older stored state is rejected rather than converted. LearnLoop never resets or
deletes DSH data on its own; the state simply stops validating until you clear it.

每次持久化形状变更都会同时提升状态 schema、Storage Domain 版本与备份格式，并构成一次**彻底断层**。**不提供迁移、兼容别名或旧数据导入**——旧状态会被拒绝而不是转换。LearnLoop 不会自行重置或删除 DSH 数据；在您清理之前，状态只会持续校验失败。

Current epoch: **state schema 18, Storage Domain 15, backup format 12**（见 `CHANGELOG.md`）。

To reset, pick one / 重置方式二选一：

- **Clear only LearnLoop data / 只清空 LearnLoop 数据** — remove the `learnloop` Storage Domain
  state inside your `DSH_HOME`, leaving every other DSH feature untouched.
  / 删除 `DSH_HOME` 下的 `learnloop` Storage Domain 状态，其它 DSH 功能不受影响。
- **Use an isolated home / 使用隔离的 DSH_HOME** — point `DSH_HOME` at a fresh directory (this is
  what `pnpm run acceptance:prepare` does). Recommended when you only want to try a new epoch.
  / 将 `DSH_HOME` 指向全新目录（`pnpm run acceptance:prepare` 即如此）。仅想试用新 epoch 时推荐。

Exports and backups contain learning data; take one before a breaking upgrade if you want a copy,
but note a pre-epoch backup is not importable after the break.
导出与备份包含学习数据；如需留存副本请在破坏性升级前导出，但请注意断层前的备份无法再导入。
