# 上游兼容性 / Upstream compatibility

当前边界固定为 DSH `0.1.0-rc.8`。Host 依赖 `storageDomain.open`、domain table `get/put/update` 和 `webServer.register`；Client 依赖 `window.__ModuleLoader__.load` 及 `conversation.view`、`conversation.input.dock`、`settings.section` slots。

The current boundary is pinned to DSH `0.1.0-rc.8`. The Host depends on `storageDomain.open`, domain-table `get/put/update`, and `webServer.register`; the Client depends on `window.__ModuleLoader__.load` and the `conversation.view`, `conversation.input.dock`, and `settings.section` slots.

升级时运行 `npm run test:compat && npm run build && npm test`，随后对已安装 profile 执行中英文切换、重启持久化和变更冲突 smoke。若任何 seam 变化，先更新适配器与本文档，再改变 peer pin。

On upgrade, run `npm run test:compat && npm run build && npm test`, then smoke-test Chinese/English switching, restart persistence, and mutation conflicts in an installed profile. If any seam changes, update the adapter and this document before changing peer pins.
