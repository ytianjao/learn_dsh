# 验收场景 / Acceptance scenarios

执行前先完成 `docs/CLOUD_ACCEPTANCE.md`。记录 PR commit、DSH baseline、浏览器版本及每项结果，但不要在截图或日志中包含密钥。

Complete `docs/CLOUD_ACCEPTANCE.md` first. Record the PR commit, DSH baseline, browser version, and each result, but never include credentials in screenshots or logs.

| 场景 / Scenario | 操作 / Actions | 通过标准 / Pass criteria |
| --- | --- | --- |
| 首次立项 / First project | 在首次使用面板输入目标、经验与每周时间并开始 / Enter a goal, experience, and weekly time in onboarding and start | 项目建立，出现当前任务；没有 key 也可完成 / Project and current task appear without a key |
| 计划生成 / Plan generation | 打开学习计划并展开所有阶段 / Open Plan and expand all stages | 只有一个 active v1，任务目标、预计时间与验收标准可见 / Exactly one active v1 with objectives, estimates, and criteria |
| 学习对话 / Learning conversation | 自动通道使用 mock；可选人工通道在 DSH Chat 发一条教学问题 / CI uses mock; optionally send one teaching question in DSH Chat | Mock 返回固定响应；人工通道流式完成且 LearnLoop 不接触 key / Mock returns fixed text; optional live stream completes and LearnLoop never receives the key |
| 证据更新 / Evidence update | 在当前任务选择“完成并提交证据”，输入自己的解释 / Complete the current task and submit the learner's explanation | Evidence 出现在进度与复盘；只点击完成不会单独提升掌握度 / Evidence appears in Progress and Review; completion alone does not raise mastery |
| 进度更新 / Progress update | 提交足够的不同证据并展开概念 / Submit diverse evidence and expand the concept | 掌握度按 introduced → practicing → demonstrated → mastered 离散变化，并列出依据 / Discrete levels and rationale follow the evidence rules |
| 小调整 / Minor adjustment | 产生或注入一个 update/move 小调整 / Produce or fixture a minor update/move operation | 启用自动小调整时生成新 active version，旧版本 superseded，内容真正改变 / New active version is created and content actually changes |
| 重大调整批准 / Major approval | 提交 major proposal，在计划页先观察再批准 / Submit a major proposal, inspect it, then approve | 批准前计划不变；批准后新版本生效；revert 再产生恢复版本 / No pre-approval change; apply and revert each create immutable versions |
| 刷新恢复 / Refresh recovery | 记录项目、任务和证据后刷新浏览器 / Refresh after project, task, and evidence writes | project、active plan、evidence、mastery 和语言设置保持 / Project, plan, evidence, mastery, and language persist |
| DSH 重启恢复 / DSH restart | `Ctrl+C` 停止，再运行 `pnpm run acceptance:web` / Stop and restart with the same command | 使用相同隔离 DSH_HOME 恢复全部状态 / All state returns from the same isolated DSH_HOME |
| Provider 错误 / Provider error | 在 keyless E2E 将 mock sequence 改为 `auth_error` 或 `server_error` 后提问 / Run a local mock error behavior and send a prompt | DSH 显示可操作错误，不出现部分成功；LearnLoop 页面仍可用 / Actionable error, no false success, LearnLoop remains usable |
| Key 不泄漏 / Key non-disclosure | 检查 PR diff、Actions log、artifact、导出 JSON 和浏览器截图 / Inspect diff, logs, artifacts, export, and screenshots | 不含真实 key；自动化 mock provider 完全无密钥 / No real key; the automated mock provider is entirely keyless |

## 自动与人工边界 / Automated versus manual boundary

CI 自动覆盖 build、typecheck、lint、领域/HTTP、package validation、无密钥 DSH boot、页面垂直切片、刷新恢复及 artifact 留存。真实 DeepSeek 对话、计费账户行为和生产网络错误只能由用户选择执行，不能作为 PR 必需门禁。

CI covers build, typecheck, lint, domain/HTTP tests, package validation, keyless DSH boot, browser slices, refresh persistence, and artifacts. Live DeepSeek conversation, billed-account behavior, and production network failures are user-opt-in and cannot be required PR gates.
