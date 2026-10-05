# LearnLoop for DeepSeek Harness

LearnLoop is a local-first, long-term learning companion for DeepSeek Harness (DSH) Web: a guided profile interview, a validated learning plan, task-by-task teaching with verified answers, mastery tracking, and lesson article generation/export. It follows the latest DSH source checkout (`scripts/dsh-baseline.json`, currently `0.2.1-alpha.1`) and never reads or manages model credentials.

## Requirements

- Node `^22.19.0 || >=24`, pnpm `11.7.0` (via `corepack enable`)
- The DeepSeek Harness source checkout at `./deepseek-harness` — every `@deepseek-ai/dsh*` dev dependency links to it, so the plugin and the Host share one physical module copy.

## Install from zero / 从零安装

```bash
# 1. Place and build the Harness checkout / 放入并构建 Harness 源码检出
git clone https://github.com/deepseek-ai/deepseek-harness.git deepseek-harness
#    or link an existing checkout / 或链接已有检出：
#    Windows: cmd /c mklink /J deepseek-harness D:\path\to\deepseek-harness
#    macOS/Linux: ln -s /path/to/deepseek-harness deepseek-harness
pnpm --dir deepseek-harness install && pnpm --dir deepseek-harness run build

# 2. Install and build the plugin / 安装并构建插件
pnpm install && pnpm run build

# 3. Register into the web profile and start / 注册进 web profile 并启动
pnpm exec dsh plugin --profile web add .
pnpm exec dsh web        # open the printed http://127.0.0.1:3080/?token=... URL / 打开打印的带 token 的地址
```

Then click **开启学习模式 / Start learning mode** in the UI.

## Verify

```bash
pnpm run check                # typecheck + client syntax + all tests
pnpm run lint
pnpm run verify:dsh-baseline  # peer strings, link targets, checkout drift, lockfile, workflow
pnpm run e2e:keyless:web      # full browser flow against a deterministic mock provider
```

## After editing / 修改后更新

- `src/**`: `pnpm run build`, then restart `dsh web` — the profile links the plugin in place, so there is nothing to reinstall or re-register. / 改源码后重新构建并重启服务即可，链接都是活路径，无需重装或重新注册。
- `client/bundle.js`: reload the browser page. / 改客户端 bundle 后刷新页面。
- Dependency changes: `pnpm install`. / 依赖变更后重新 install。
- `./deepseek-harness` moved forward: rebuild it, then `pnpm run verify:dsh-baseline` (bump `scripts/dsh-baseline.json` on drift, see `AGENTS.md` §13). / Harness 检出前进后重新构建并校验基线。

## Use

- **Interview:** the first question (“你现在想学什么？”) is free text; every later question is option-based — the model analyzes the subject and prior answers, then proposes beginner-friendly options, while custom text always remains valid. Confirm the generated Profile in the LearnLoop Profile view.
- **Plan and tasks:** review and approve the draft plan, then start each task explicitly. A formal check captures the next learner answer and validates every acceptance criterion; passing writes assessment, evidence, and mastery atomically.
- **Articles:** after a task passes, generate a lesson article from the Plan view and export Markdown, a static HTML site, PDF, EPUB, or a combined ZIP.

Design, protocol, and acceptance details live in `docs/` and `AGENTS.md`; state-schema epochs and their reset procedure are recorded in `CHANGELOG.md`.
