# 变更日志 / Changelog

## Unreleased

- 增加固定 DSH/Node/pnpm 的 GitHub Actions 与私有 Codespaces 云端验收通道 / Added GitHub Actions and a private Codespaces acceptance lane pinned to DSH, Node, and pnpm.
- 增加隔离且可重复的 profile 准备、loopback Web 启动、验收清理脚本和完整人工场景 / Added repeatable isolated-profile preparation, loopback Web startup, reset scripts, and manual scenarios.
- 使用 Storage Domain 原子 update 修复并发丢失更新，并保持 reset revision 单调 / Fixed concurrent lost updates with atomic Storage Domain updates and monotonic reset revisions.
- 使用严格 Zod schema 校验所有 mutation、枚举、置信度和结构化操作 / Added strict Zod validation for every mutation, enum, confidence value, and structured operation.
- 计划调整现在实际应用 update/move 操作，撤销使用逆操作创建新版本 / Plan adjustments now apply update/move operations, and revert creates a new version through inverse operations.
- LearnLoop 网页可在简体中文和 English 间完整切换 / The complete LearnLoop web UI now switches between Simplified Chinese and English.
- 核心文档、用户文案和关键代码注释改为中英双语 / Made core documentation, user copy, and key code comments bilingual.

## 0.1.0

- LearnLoop Host、Web Client、领域模型、HTTP API、测试与文档的初始版本 / Initial LearnLoop Host, Web Client, domain model, HTTP API, tests, and documentation.
