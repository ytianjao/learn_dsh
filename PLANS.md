# 交付计划 / Delivery plan

| 切片 / Slice | 状态 / Status | 验证 / Verification |
| --- | --- | --- |
| 基线与加载 / Baseline and load | 完成 / Complete | compatibility + installed-profile smoke |
| 双语网页外壳 / Bilingual web shell | 完成 / Complete | Client syntax + bilingual manual/E2E acceptance |
| 项目初始化 / Project initialization | 完成 / Complete | domain + HTTP + persistence tests |
| 对话边界 / Conversation boundary | 完成 / Complete | DSH Chat remains authoritative |
| 证据与掌握度 / Evidence and mastery | 完成 / Complete | idempotency + mastery tests |
| 调整与撤销 / Adjustment and revert | 完成 / Complete | executable operation + immutable-version tests |
| 恢复与安全 / Recovery and safety | 完成 / Complete | atomic CAS, monotonic reset, strict schemas, same-origin tests |
| 打包 / Packaging | 完成，真实密钥 smoke 由用户执行 / Complete; live-key smoke is user-owned | build + pack validation |

唯一外部验收是用户在 DSH 中自行配置模型后的真实流式对话。LearnLoop 不读取或接收该凭据。

The sole external acceptance step is a live streamed conversation after the user configures a model in DSH. LearnLoop never reads or receives that credential.
