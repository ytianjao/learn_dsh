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

These run **inside the sandbox**; the host has no `node_modules` (see "Sandbox (sbx)").
`scripts/sandbox-setup.mjs` prepared it, and `sbx exec … CI=true` is the shape every command
takes. / 以下命令都在**沙箱内**运行，宿主机没有 `node_modules`（见“沙箱（sbx）”）。沙箱由
`scripts/sandbox-setup.mjs` 准备好，所有命令统一采用 `sbx exec … CI=true` 的形式。

```bash
S="sbx exec my-sandbox bash -lc"; R="cd /d/code/learn_dsh"
$S "$R && CI=true pnpm run check"                # typecheck + client syntax + all tests
$S "$R && CI=true pnpm run lint"
$S "$R && CI=true pnpm run verify:dsh-compat"    # peer ranges vs the installed Harness, and registry-only resolution
$S "$R && CI=true pnpm run e2e:keyless:web"      # full browser flow against a deterministic mock provider
$S "$R && MOCK_MODEL_POLICY=null CI=true pnpm run e2e:keyless:web"   # the same flow with a "null model" that sends only the question token
```

## After editing / 修改后更新

This repo keeps **no `node_modules` on the host** — only inside the sandbox (see "Sandbox (sbx)"
below). `pnpm run` therefore does not work from the repo root on the machine you edit on; run the
build and the tests through `dshweb` or `sbx exec`.
/ 本仓库在宿主机上**不保留 `node_modules`**，依赖只存在于沙箱中（见下面的“沙箱（sbx）”）。因此在
编辑所在的机器上，仓库根目录里的 `pnpm run` 并不可用；构建与测试请通过 `dshweb` 或 `sbx exec` 执行。

- `src/**`: `pnpm run dshweb` — it rebuilds the plugin inside the sandbox against the sandbox's
  install and restarts `dsh web`. The profile links the plugin in place, so there is nothing to
  reinstall or re-register. / 改源码后执行 `pnpm run dshweb`：它在沙箱内用沙箱自己的依赖重新构建插件
  并重启 `dsh web`；链接都是活路径，无需重装或重新注册。
- `client/bundle.js`: reload the browser page. / 改客户端 bundle 后刷新页面。
- Dependency changes: `pnpm run sandbox:setup --force-reinstall`, or `CI=true pnpm install`
  inside the sandbox. / 依赖变更后：`pnpm run sandbox:setup --force-reinstall`，或到沙箱内执行
  `CI=true pnpm install`。
- Tests: `sbx exec my-sandbox bash -lc 'cd /d/code/learn_dsh && CI=true pnpm run check'`.
  / 测试：在沙箱内执行上述 `check`。
- Upgrading DSH: `npx -y @deepseek-ai/dsh@alpha ...` picks up the newest alpha on its own. After a Harness upgrade, run `pnpm run sandbox:setup --force-reinstall` (to move the devDependencies) and `pnpm run verify:dsh-compat`; if it reports an incompatible peer, widen or adjust the range in `package.json` and fix our own code, per "When you change things" in `AGENTS.md`. / 升级 DSH：`npx -y @deepseek-ai/dsh@alpha ...` 会自动使用最新的 alpha。升级后在沙箱内重新 install（同步开发依赖）并执行 `pnpm run verify:dsh-compat`；若报 peer 不兼容，按 `AGENTS.md` 的“When you change things”调整 `package.json` 的范围并修改我们自己的代码。

## Sandbox (sbx) / 沙箱（sbx）

The sandbox owns the whole loop: it has its own npm install of the Harness, its own copy of this
repo's dependencies, and the plugin stays bind-mounted from this repo. `scripts/dshweb.mjs` wires
that up — it installs if needed, builds the plugin **inside the sandbox**, starts (or restarts)
`dsh web`, and prints a URL for the host browser. / 整套流程都在沙箱内完成：Harness 用它自己的
npm 安装，本仓库的依赖也由沙箱自己装，插件则从本仓库 bind-mount 进去。`scripts/dshweb.mjs` 把
这一步串起来：按需安装、在**沙箱内**构建插件、启动（或重启）`dsh web`，并打印可在宿主机浏览器
打开的地址。

```bash
pnpm run dshweb          # install if needed, build, restart DSH Web, print the URL / 按需安装、构建、重启并打印地址
pnpm run dshweb stop     # stop it / 停止
```

`pnpm run dshweb` and `pnpm run sandbox:setup` are the only two commands meant to run on the host.
They reach the sandbox through `sbx`, so they work from a checkout with no `node_modules` at all.
/ 只有 `pnpm run dshweb` 与 `pnpm run sandbox:setup` 这两个命令是在宿主机上执行的；它们通过 `sbx`
进入沙箱，因此在完全没有 `node_modules` 的检出上也能运行。

One-time sandbox setup / 沙箱一次性准备：

```bash
pnpm run sandbox:setup     # idempotent; safe to re-run after a sandbox restart
```

Development and testing happen **inside** the sandbox. `sandbox:setup` makes a fresh one
capable of it, because two properties of the mount break a plain checkout:

- **The repo is bind-mounted from Windows over virtiofs, which has no symlinks.** pnpm's
  isolated `node_modules` is a tree of them, so `pnpm install` fails with `EPERM` on the mount.
  The script binds a sandbox-local directory (on the sandbox's own overlayfs) over
  `node_modules`, which fixes it. The mount lasts for the life of the container, not a restart.
  / 仓库从 Windows 经 virtiofs 挂载，**不支持符号链接**；pnpm 的隔离式 `node_modules` 全是符号
  链接，`pnpm install` 会在挂载点上报 `EPERM`。脚本把一个沙箱本地目录（在沙箱自己的
  overlayfs 上）bind-mount 到 `node_modules` 上解决；该挂载只在容器存活期间有效，重启后需重跑。
- **The host's `node_modules` is visible in the sandbox but is a Windows install.** Its native
  binaries (`rollup`, `koffi`, `node-pty`) are `.node` files for the wrong OS, so `vitest` dies
  with `MODULE_NOT_FOUND`. The sandbox needs its own install; never copy the host's in.
  / 宿主机的 `node_modules` 在沙箱里可见，但那是 Windows 版安装；其中的原生二进制（`rollup`、
  `koffi`、`node-pty`）是为另一个系统编译的 `.node`，`vitest` 会以 `MODULE_NOT_FOUND` 失败。
  沙箱必须自己装一份，不要把宿主机的复制进去。

The script also installs a Playwright browser (the keyless E2E needs a real one), the CJK fonts
the PDF/EPUB export assertions render with, and `tmux`/`tree`/`zip`/`fd`.
/ 脚本还会装 Playwright 浏览器（无密钥 E2E 需要真实浏览器）、PDF/EPUB 导出断言所需的 CJK 字体，
以及 `tmux`/`tree`/`zip`/`fd`。

Run commands in the sandbox with `CI=true`: without it pnpm aborts the modules-dir purge for
want of a TTY. Use the **guest** address for anything that talks to the server from inside the
sandbox — the host-published `127.0.0.1:3080` is not reachable there.
/ 在沙箱里执行命令要带 `CI=true`：否则 pnpm 因无 TTY 而中止删除 modules 目录。在沙箱内部访问
服务要用**沙箱自己的**地址，宿主机发布的 `127.0.0.1:3080` 在沙箱内不可达。

The guest address (`172.17.0.1`) is **not** in the sandbox's `no_proxy`, which lists only
`localhost`, `127.0.0.1`, `::1`, and `gateway.docker.internal`. A request there is therefore sent
to the sandbox's own proxy, which answers `500 EOF` — easy to mistake for a DSH fault. Add the
guest address to `no_proxy` when driving the server from inside the sandbox:

```bash
export no_proxy="localhost,127.0.0.1,::1,gateway.docker.internal,172.17.0.1"
# then, e.g. against the instance dshweb started:
DSH_WEB_URL="http://172.17.0.1:3080/?$(grep -oE 'token=[A-Za-z0-9_-]+' /tmp/dshweb.log | tail -1)" \
  CI=true npx playwright test          # `pnpm run test:e2e` half: Playwright vs a running DSH Web
```

/ 沙箱的 `no_proxy` 只列了 `localhost`、`127.0.0.1`、`::1` 和 `gateway.docker.internal`，**不含**
来宾地址 `172.17.0.1`；因此发往它的请求会走沙箱自己的代理，返回 `500 EOF`，很容易误判成 DSH 的
故障。在沙箱内驱动服务时，把来宾地址加进 `no_proxy` 即可。

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
