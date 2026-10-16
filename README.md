# LearnLoop for DeepSeek Harness

LearnLoop is a local-first, long-term learning companion for DeepSeek Harness (DSH) Web: a guided profile interview, a validated learning plan, task-by-task teaching with verified answers, mastery tracking, and lesson article generation/export. It follows the published DSH release from the npm registry and never reads or manages model credentials.

## Requirements

- Node `^22.19.0 || >=24`, pnpm `11.7.0` (via `corepack enable`)
- The DeepSeek Harness, **installed from npm** — there is no source checkout to clone, build, or keep on disk. `npx @deepseek-ai/dsh@alpha` runs it, and this repo's `@deepseek-ai/*` devDependencies install the same published packages. / Harness **从 npm 安装**——无需克隆、构建或保留任何源码检出。`npx @deepseek-ai/dsh@alpha` 即可运行，本仓库的 `@deepseek-ai/*` 开发依赖安装的是同一批发布包。

Use the **alpha** channel: the `latest` tag still points at an older release. / 请使用 **alpha** 频道：`latest` 标签指向的仍是较旧的版本。

## Install from zero / 从零安装

Run from this repo's root. / 在本仓库根目录执行。

```bash
# 1. Install the plugin's dependencies (DSH packages come from npm) and build it
#    安装插件依赖（DSH 包均来自 npm）并构建
pnpm install --frozen-lockfile && pnpm run build
pnpm run verify:dsh-compat

# 2. Install the plugin into the web profile
#    把插件安装到 web profile
npx -y @deepseek-ai/dsh@alpha plugin --profile web add .

# 3. Start DSH from a separate study folder
#    到单独的学习目录启动 DSH
mkdir -p ../learnloop-study && cd ../learnloop-study
npx -y @deepseek-ai/dsh@alpha web   # open the printed http://127.0.0.1:3080/?token=... URL / 打开打印的带 token 的地址
```

Start `dsh web` outside this repo: DSH uses the launch directory as the session workspace, so a session started here would read this repo's `AGENTS.md` and could edit the plugin source. / 不要在本仓库里启动 `dsh web`：DSH 以启动目录作为会话工作区，在这里启动会让学习会话读到本仓库的 `AGENTS.md`，并能改写插件源码。

Then click **开启学习模式 / Start learning mode** in the UI. / 然后在界面中点击 **开启学习模式 / Start learning mode**。

Keep it on npm / 只用 npm 发布版：

- `npx` downloads nothing permanent; the Harness runs from the npm cache. To pin a version for a session, name it: `npx -y @deepseek-ai/dsh@0.2.1-alpha.4`. / `npx` 不会留下常驻文件，Harness 直接从 npm 缓存运行；需要固定某次会话的版本时就写明版本号。
- The repo's `@deepseek-ai/*` devDependencies must stay registry ranges — do not reintroduce a `link:` to a local checkout. `pnpm run verify:dsh-compat` rejects one. / 本仓库的 `@deepseek-ai/*` 开发依赖必须保持 npm 版本范围，不要再引入指向本地检出的 `link:`；`pnpm run verify:dsh-compat` 会拒绝它。
- A peer range that the running Harness rejects disables this plugin at startup. `pnpm run verify:dsh-compat` runs the Host's own compatibility check, so drift surfaces there instead. / 若 peer 范围不被当前 Harness 接受，插件会在启动时被禁用；`pnpm run verify:dsh-compat` 直接调用 Host 自己的兼容性判定，因此版本漂移会在这里先暴露。

## Verify

```bash
pnpm run check                # typecheck + client syntax + all tests
pnpm run lint
pnpm run verify:dsh-compat    # peer ranges vs the installed Harness, and registry-only resolution
pnpm run e2e:keyless:web      # full browser flow against a deterministic mock provider
MOCK_MODEL_POLICY=null pnpm run e2e:keyless:web   # the same flow with a "null model" that sends only the question token
```

## After editing / 修改后更新

- `src/**`: `pnpm run build`, then restart `dsh web` — the profile links the plugin in place, so there is nothing to reinstall or re-register. / 改源码后重新构建并重启服务即可，链接都是活路径，无需重装或重新注册。
- `client/bundle.js`: reload the browser page. / 改客户端 bundle 后刷新页面。
- Dependency changes: `pnpm install`. / 依赖变更后重新 install。
- Upgrading DSH: `npx -y @deepseek-ai/dsh@alpha ...` picks up the newest alpha on its own. After a Harness upgrade, run `pnpm install` (to move the devDependencies) and `pnpm run verify:dsh-compat`; if it reports an incompatible peer, widen or adjust the range in `package.json` and fix our own code, per "When you change things" in `AGENTS.md`. / 升级 DSH：`npx -y @deepseek-ai/dsh@alpha ...` 会自动使用最新的 alpha。升级后执行 `pnpm install`（同步开发依赖）与 `pnpm run verify:dsh-compat`；若报 peer 不兼容，按 `AGENTS.md` 的“When you change things”调整 `package.json` 的范围并修改我们自己的代码。

## Sandbox (sbx) / 沙箱（sbx）

`sbx` runs the Harness on the sandbox's own npm install while the plugin stays bind-mounted
from this repo, so a host rebuild is what the sandbox serves. `scripts/dshweb.mjs` wires that
up: it builds the plugin, starts (or restarts) `dsh web` inside the sandbox, and prints a
loopback URL for the browser. / `sbx` 让 Harness 跑在沙箱自己的 npm 安装上，而插件仍从本仓库
bind-mount 进去，因此宿主机的一次构建就是沙箱所服务的内容。`scripts/dshweb.mjs` 把这一步
串起来：构建插件、在沙箱内启动（或重启）`dsh web`，并打印可直接在宿主机浏览器打开的
回环地址。

```bash
pnpm run dshweb          # build the plugin, restart DSH Web, print the URL / 构建并重启，打印地址
pnpm run dshweb stop     # stop it / 停止
```

One-time sandbox setup / 沙箱一次性准备：

- The sandbox needs its own `dsh`, installed flat (`nodeLinker: hoisted`) so the platform
  native addon links as a sibling of the package that loads it — a pnpm-global install leaves
  `node-addon-require-builtin` without its `.node` binary and `dsh` fails to start.
  / 沙箱需要自己的一份 `dsh`，且必须用扁平布局（`nodeLinker: hoisted`）安装：pnpm 全局安装不会
  把平台原生扩展链成加载方的同级包，`node-addon-require-builtin` 缺 `.node` 二进制，`dsh` 起不来。
- `dsh web` is started with `setsid nohup` under `sbx exec`: a plain `sbx exec` tears down its
  process tree when it returns, so the server has to reparent to the sandbox's init.
  / `dsh web` 在 `sbx exec` 下用 `setsid nohup` 启动：裸 `sbx exec` 返回时会连带杀掉自己的进程树，
  服务必须重新挂到沙箱 init 下。
- The sandbox declares `D:\code\deepseek-harness` as a workspace, so a **placeholder directory
  of that name must exist** or the sandbox refuses to start. It is otherwise unused — the
  checkout is no longer needed. / 沙箱把 `D:\code\deepseek-harness` 声明为 workspace，因此该名称的
  **占位目录必须存在**，否则沙箱拒绝启动；此外它已无用途，源码检出不再需要。

Config via env: `DSHWEB_SANDBOX`, `DSHWEB_PORT` (host, default 3080), `DSHWEB_GUEST_PORT`,
`DSHWEB_WORKDIR` (launch directory inside the sandbox, default `/d/code/learn`).
/ 可用环境变量覆盖：`DSHWEB_SANDBOX`、`DSHWEB_PORT`（宿主机端口，默认 3080）、
`DSHWEB_GUEST_PORT`、`DSHWEB_WORKDIR`（沙箱内启动目录，默认 `/d/code/learn`）。

## Use

- **Interview:** a short baseline — what you want to learn, how far, what you have tried, how you want to learn, and your weekly time (plus practice limits if you want hands-on practice). Every question is defined by LearnLoop, single- or multi-select as it should be, and custom text always remains valid. The model may add a relevant optional question (such as a deadline when you mention an exam), reword questions for your subject, or assume an answer you already made clear — all of it is flagged in the LearnLoop Profile view, where you can edit any field, fill in ones that were not asked, and confirm. / 访谈只有一个很短的基线：想学什么、学到什么程度、接触过什么、想怎么学、每周时间（选择动手练习时再问练习限制）。每道题都由 LearnLoop 定义，该多选的就是多选，也始终可以自己输入。模型可以按需追加相关的可选题（例如你提到考试时追问期限）、按你的主题改写题目，或推断你已说清的答案——这些都会在学习档案审阅页中标注；你可以在审阅页修改任一字段、补充未询问的内容，再确认档案。
- **Plan and tasks:** review and approve the draft plan, then start each task explicitly. A formal check captures the next learner answer and validates every acceptance criterion; passing writes assessment, evidence, and mastery atomically.
- **Articles:** after a task passes, generate a lesson article from the Plan view and export Markdown, a static HTML site, PDF, EPUB, or a combined ZIP.

Design, protocol, and acceptance details live in `docs/` and `AGENTS.md`; state-schema epochs and their reset procedure are recorded in `CHANGELOG.md`.

## Breaking upgrades / 破坏性升级

Every persisted-shape change raises the state schema, the Storage Domain version, and the backup
format together and forms a **clean break**. There is **no migration, no compatibility alias, and no
legacy import** — an older stored state is rejected rather than converted. LearnLoop never resets or
deletes DSH data on its own. When the stored data is from another epoch, `dsh web` still starts
and LearnLoop shows **清除旧数据 / Clear old data**; that button moves the old
`storages/learnloop.json` to `learnloop/stale-backups/` under your `DSH_HOME` and starts fresh.

每次持久化形状变更都会同时提升状态 schema、Storage Domain 版本与备份格式，并构成一次**彻底断层**。**不提供迁移、兼容别名或旧数据导入**——旧状态会被拒绝而不是转换。LearnLoop 不会自行重置或删除 DSH 数据。当已存数据来自另一个 epoch 时，`dsh web` 仍能启动，LearnLoop 会显示 **清除旧数据 / Clear old data**；点击后旧的 `storages/learnloop.json` 会被移到 `DSH_HOME` 下的 `learnloop/stale-backups/`，并重新开始。

Current epoch: **state schema 19, Storage Domain 16, backup format 13**（见 `CHANGELOG.md`）。

To reset by hand instead, pick one / 也可手动重置，二选一：

- **Clear only LearnLoop data / 只清空 LearnLoop 数据** — remove the `learnloop` Storage Domain
  state inside your `DSH_HOME`, leaving every other DSH feature untouched.
  / 删除 `DSH_HOME` 下的 `learnloop` Storage Domain 状态，其它 DSH 功能不受影响。
- **Use an isolated home / 使用隔离的 DSH_HOME** — point `DSH_HOME` at a fresh directory (this is
  what `pnpm run acceptance:prepare` does). Recommended when you only want to try a new epoch.
  / 将 `DSH_HOME` 指向全新目录（`pnpm run acceptance:prepare` 即如此）。仅想试用新 epoch 时推荐。

Exports and backups contain learning data; take one before a breaking upgrade if you want a copy,
but note a pre-epoch backup is not importable after the break.
导出与备份包含学习数据；如需留存副本请在破坏性升级前导出，但请注意断层前的备份无法再导入。
