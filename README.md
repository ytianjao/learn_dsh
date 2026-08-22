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

计划由当前 DSH 对话所选模型通过受约束 Tool 生成；LearnLoop 不读取模型凭据，也不把自然语言输出当作正式计划。

The model selected in the current DSH chat publishes the plan through a constrained tool; LearnLoop neither reads credentials nor treats prose as an authoritative plan.

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


## DSH Chat generated plans (PR #13)

LearnLoop now creates an empty active plan and sends a structured planning request through the public DSH Chat `InputActions`. The selected DSH model must publish the complete authoritative plan with `learnloop_publish_plan`; LearnLoop never reads API keys, calls a provider, or parses assistant prose. The Host validates keys, sizes, uniqueness, dependency references and DAG shape, then assigns IDs/status/version and commits plan, mastery, events, and one revision atomically.

User flow: (1) configure and select a model in **DSH Settings → Models**; (2) enter a LearnLoop goal; (3) choose **Start learning**; (4) observe the planning request in Chat; (5) the model calls `learnloop_publish_plan`; (6) the model introduces the returned first task; (7) choose **Start task in chat** for teaching; (8) submit your own evidence in LearnLoop; (9) export before using **Discard current plan** to start over. Normal `dsh web` uses the selected user model; only browser E2E uses the deterministic mock provider.

DSH owns session, Chat, model routing, streaming, credentials, and the tool execution runtime. LearnLoop owns the learning project, validated structured plan, evidence, mastery, review, and plan-publication rules. Discard is destructive, not history archival: it removes current business data while preserving settings. Export first when an audit copy is required.

## Learning modes and progression (runtime v2)

1. Choose a learning mode and current practice capacity.
2. Enter the learning goal, prior experience, weekly time, explanation depth, and example density.
3. Start learning. Chat receives exactly the original trimmed goal; LearnLoop control context is contributed to the DSH request/header and Trajectory through a session-scoped System Prompt.
4. The model may teach only the current task. **Continue this lesson** expands that lesson; it does not change authoritative state.
5. Submit the inline lesson check before the next lesson unlocks, then explicitly start it.

`knowledge-first` emphasizes systematic explanations, boundaries, misconceptions, and multiple worked examples; `balanced` combines explanation and moderate exercises; `practice-first` emphasizes deliverables only when explicitly selected. Practice capacity `none` forbids implementation and artifact requirements, `light` permits small exercises but no artifact gate, and `full` permits normal implementation work.

LearnLoop binds a project to the public DSH session ID. Other sessions receive no LearnLoop System Prompt and cannot publish that project's plan. Legacy v1 projects migrate without data loss and remain unbound until the user explicitly binds the current session.

> Limitation: LearnLoop does not semantically filter arbitrary model prose. Domain transitions are deterministic; recurring model behavior is constrained by DSH System Prompt. Inline evidence currently uses `learnloop-inline-checkpoint` until real message references are integrated.

## Runtime hardening (PR #20)

A LearnLoop project is bound to exactly one DSH Session. The Host returns a server-redacted projection to foreign sessions and rejects their project mutations; this local product-state isolation prevents accidental cross-session access, but is not multi-user or multi-tenant authentication. Same-origin remains the HTTP write boundary and LearnLoop never receives model credentials.

Task status changes are available only through semantic commands: start, pause, resume, skip, safe restore, and atomic completion with evidence. A blocked task remains the current learning position; only completed or skipped dependencies are satisfied, and skipping never means mastery. Completing a task does not auto-start its successor.

Invariants: `project.sessionId === mutation.sessionId`; active and blocked current tasks cannot coexist; `foreign => no project, plan, evidence, mastery, assessment, adjustment, or event content`.
