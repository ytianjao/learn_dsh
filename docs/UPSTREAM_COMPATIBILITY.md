# 上游兼容性 / Upstream compatibility

DSH is installed from the npm registry — `npx @deepseek-ai/dsh@alpha` runs it and no source
checkout is kept on disk. The machine-readable statement of compatibility is the peer range in
`package.json`, checked by `pnpm run verify:dsh-compat` against the installed Harness. The exact installed
version floats inside that range and is recorded by `pnpm-lock.yaml`, not by this document.

| LearnLoop | DSH peer range | Node | pnpm | Cordis peer | Known limitation |
| --- | --- | --- | --- | --- | --- |
| 0.11.0 | ^0.2.1-alpha.1 | ^22.19.0 or >=24 | 11.7.0 | ^4.0.5-alpha.1 | Provenance fails closed when required raw events are absent or ambiguous after external log rewriting. |

当前边界为 `package.json` peer 范围内的 DSH npm 发布版（范围浮动，实际安装版本记录在 `pnpm-lock.yaml`）。Host 依赖 `storageDomain.open`、domain table `get/put/update` 和 `webServer.register`；Client 依赖 `window.__ModuleLoader__.load` 及 `conversation.view`、`conversation.input.left`、`sidebar.footer.action`、`settings.section` slots。

The current boundary is the DSH npm release inside the `package.json` peer range (the range floats; the installed version is recorded in `pnpm-lock.yaml`). The Host depends on `storageDomain.open`, domain-table `get/put/update`, and `webServer.register`; the Client depends on `window.__ModuleLoader__.load` and the `conversation.view`, `conversation.input.left`, `sidebar.footer.action`, and `settings.section` slots.

升级时运行 `pnpm run verify:dsh-compat && pnpm run build && pnpm test`，随后对已安装 profile 执行中英文切换、重启持久化和变更冲突 smoke。若任何 seam 变化，先更新适配器与本文档，再改变 peer 范围。

On upgrade, run `pnpm run verify:dsh-compat && pnpm run build && pnpm test`, then smoke-test Chinese/English switching, restart persistence, and mutation conflicts in an installed profile. If any seam changes, update the adapter and this document before changing peer ranges.

## 产品语义 / Product semantics

本文件只记录 LearnLoop 依赖的上游 seam。运行时契约、Session 隔离、持久化边界与审阅边界的唯一定义在 `docs/PRODUCT_CONTRACT.md`，这里不再复述。

This file records only the upstream seams LearnLoop depends on. The runtime contract, Session isolation, persistence boundary, and review boundary are defined once, in `docs/PRODUCT_CONTRACT.md`, and are not restated here.

## Typed Session integration
Verified-answer integration is constrained to the public agent/session/tool surfaces of DSH inside the peer range: waterfall pre-step decisions, direct user-message source kinds, public Session events, and tool execution agent/call/signal provenance. DSH source and provider credentials remain untouched.

## Tool schema support for Plan Intent

DSH inside the peer range publicly supports `defineTool`, `title`, `description`, `examples`, `enum`,
`const`, `oneOf`, and explicit-object `additionalProperties`. Its implicit parameter root is
open, so the plan executor rejects root keys other than `plan` before reading state. Typed
validation raises `INVALID_ARGS` before the executor. `finalizeContent` receives normalized
failures and is used to explain an invalid activity path/value/allowed set without retrying or
rewriting it. The returned Tool definition exposes its canonical schema and validated executor
as the public testing seam. No upstream code is modified.
