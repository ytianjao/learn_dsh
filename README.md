# LearnLoop for DeepSeek Harness

> 本文档采用中英双语。每个中文段落后提供对应英文。
> This document is bilingual. Every Chinese section is followed by its English counterpart.

## 简介 / Overview

LearnLoop 是安装在 DeepSeek Harness Web 中的本地优先、长期学习伴侣。用户可以建立学习项目、使用 DSH 对话、检查基于证据的进度、审阅计划，并批准重要计划调整。

LearnLoop is a local-first, long-term learning companion for DeepSeek Harness Web. Learners create projects, use ordinary DSH Chat, inspect evidence-based progress, review plans, and approve significant plan adjustments.

## 要求 / Requirements

- DSH `0.1.0-rc.8`，基线提交 `141eb6fef83422698aef7a981029e843e8161534` / DSH `0.1.0-rc.8` at baseline commit `141eb6fef83422698aef7a981029e843e8161534`
- Node `^22.19` 或 `>=24` / Node `^22.19` or `>=24`
- 受支持的浏览器 / A supported browser

安装、构建、无密钥测试、计划/进度、回放和包验证不需要 DeepSeek API key。实时对话所需密钥仅在 **DSH Settings → Models** 中配置；LearnLoop 不读取或接收密钥。

Install, build, keyless tests, plan/progress, replay, and package validation do not require a DeepSeek API key. Configure a key only in **DSH Settings → Models** for live conversation; LearnLoop never reads or receives it.

## 安装与启动 / Install and start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add .
dsh --profile web --dump-config
dsh web
```

打开 DSH 输出的地址。Web profile 会同时发现 Host 插件与 `./client` 模块。手动组装的 profile 应在 DSH base 和 Web App 层之后应用 `profiles/learnloop.patch.yml`。

Open the URL printed by DSH. The Web profile discovers both the Host plugin and the `./client` module. A manually assembled profile should apply `profiles/learnloop.patch.yml` after the DSH base and Web App layers.

## 网页使用 / Browser usage

1. 在当前对话输入框上方描述学习目标，然后选择“开始学习” / Describe your learning goal above the composer and select “Start learning”.
2. 使用普通 DSH Chat 进行实时教学 / Use ordinary DSH Chat for live teaching.
3. 打开“学习计划 / Learning Plan”“学习进度 / Progress”和“复盘 / Review” / Open the Plan, Progress, and Review views.
4. 在当前任务面板提交自己的解释或证据；仅点击完成不会证明掌握 / Submit your own explanation or evidence; clicking complete alone does not prove mastery.
5. 在 **Settings → LearnLoop → 界面语言 / Interface language** 中即时切换简体中文或 English / Switch the complete LearnLoop UI between Simplified Chinese and English.

当前 keyless v1 从确定性的 Agent 工程模板开始。用户输入仍会持久化，但不会被表示为已经完成语义课程生成。

The current keyless v1 begins with a deterministic Agent-engineering template. The learner input is persisted, but the product does not represent it as semantically generated curriculum.

## 一致性与计划调整 / Consistency and plan adjustments

所有写入在 Storage Domain 的原子 `update` 内检查单调 revision。可重试变更使用幂等键。reset 清空学习数据但不会令 revision 回退。

Every write checks a monotonic revision inside the Storage Domain's atomic `update`. Retryable mutations carry idempotency keys. Reset clears learning data without rolling the revision backward.

计划调整包含可执行的结构化操作和便于审阅的 diff。小调整可自动生成新计划版本；大调整必须批准。撤销操作会应用已保存的逆操作并生成另一个不可变计划版本。

Plan adjustments contain machine-applicable structured operations plus a reviewable diff. Minor changes may create a new plan version automatically; major changes require approval. Revert applies stored inverse operations and creates another immutable version.

## 备份、升级与卸载 / Backup, upgrade, and uninstall

在 LearnLoop 设置中选择“导出 / 备份”。JSON 是便携审计副本；完整恢复仍使用 DSH Home 备份流程。卸载前可先导出，然后执行：

Choose “Export / Backup” in LearnLoop settings. JSON is a portable audit copy; complete restore still uses the DSH Home backup procedure. Export first if needed, then uninstall with:

```bash
dsh plugin --profile web remove @learnloop/dsh-learnloop
```

升级后应运行 `npm run test:compat`，并人工验证 Plan、Progress 和 Review。卸载不会删除 DSH 模型凭据。

After an upgrade, run `npm run test:compat` and manually verify Plan, Progress, and Review. Uninstalling does not delete DSH model credentials.

## 开发与检查 / Development and checks

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:e2e
pnpm run package:validate
```

浏览器 E2E 需要已运行的 DSH Web fixture，地址由 `DSH_WEB_URL` 指定，默认是 `http://127.0.0.1:3080`。常规检查不会调用模型提供商。

Browser E2E requires a running DSH Web fixture at `DSH_WEB_URL`, defaulting to `http://127.0.0.1:3080`. Routine checks never call a model provider.

架构和验收资料 / Architecture and acceptance references: `docs/DSH_BASELINE.md`, `docs/PRODUCT_CONTRACT.md`, `docs/WEB_ACCEPTANCE.md`, and `docs/UPSTREAM_COMPATIBILITY.md`.
