      const stores = new Map()
      function workspaceIdForSession(sessionId, workspaces) {
        if (!sessionId) return null
        const found = (workspaces || []).filter(function (workspace) { return (workspace.sessionIds || []).includes(sessionId) })
        return found.length === 1 ? found[0].workspaceId : null
      }
      function createStore(workspaceId) { return { workspaceId: workspaceId, status: workspaceId ? 'loading' : 'empty/no-workspace', value: null, error: null, request: 0, listeners: new Set(), subscribers: 0, timer: null } }
      function storeFor(workspaceId) { const key = workspaceId || '__no-workspace__'; if (!stores.has(key)) stores.set(key, createStore(workspaceId)); return stores.get(key) }
      function notify(store) { store.listeners.forEach(function (listener) { listener() }) }
      async function load(workspaceId) {
        const store = storeFor(workspaceId)
        if (!workspaceId) { store.status = 'empty/no-workspace'; store.value = null; store.error = null; notify(store); return store }
        const request = ++store.request
        store.status = store.value ? 'refreshing' : 'loading'; store.error = null; notify(store)
        try {
          const response = await fetch(API + '?workspaceId=' + encodeURIComponent(workspaceId), { cache: 'no-store' })
          if (!response.ok) { const payload = await response.json().catch(function () { return null }); if (payload && payload.incompatibleStorage) { if (request === store.request) { store.value = null; store.error = null; store.incompatible = payload.incompatibleStorage; store.status = 'incompatible'; notify(store) } return store } throw new Error(payload && payload.error ? payload.error.message : 'HTTP ' + response.status) }
          const value = await response.json()
          if (request === store.request) { store.value = value; store.incompatible = null; store.status = activeProjectOf(value) ? 'ready' : 'empty/no-workspace'; notify(store) }
        } catch (error) {
          if (request === store.request) { store.error = String(error && error.message || error); store.status = store.value ? 'ready' : 'error'; notify(store) }
        }
        if (store.subscribers > 0 && !store.timer) { const polled = activeProjectOf(store.value), phase = polled && polled.execution && polled.execution.phase; const active = ['interviewing','planning','teaching','awaiting-answer','verifying','needs-revision','passed'].includes(phase || (polled && polled.phase)); store.timer = setTimeout(function () { store.timer = null; if (store.subscribers > 0) load(workspaceId) }, active ? 1000 : 5000) }
        return store
      }
      function retainSync(store) { store.subscribers++; if (store.subscribers === 1 && !store.timer) load(store.workspaceId); return function () { store.subscribers--; if (store.subscribers === 0 && store.timer) { clearTimeout(store.timer); store.timer = null } } }
      function useWorkspace(props) {
        const workspaces = props.useWorkspaces(function (state) { return state.items })
        const workspaceId = workspaceIdForSession(props.sessionId, workspaces)
        const store = storeFor(workspaceId)
        const redraw = React.useReducer(function (x) { return x + 1 }, 0)[1]
        React.useEffect(function () { store.status = workspaceId ? 'resolving-workspace' : 'empty/no-workspace'; const listener = function () { redraw() }; store.listeners.add(listener); const release = retainSync(store); return function () { store.listeners.delete(listener); release() } }, [workspaceId, store])
        return store
      }
      function Status(props) {
        const store = props.store
        if (store.status === 'resolving-workspace' || store.status === 'loading') return e('div', { className: 'll-loading' }, '正在同步 LearnLoop… / Syncing LearnLoop…')
        if (store.status === 'incompatible') return e(IncompatibleStorage, { info: store.incompatible, onReset: function () { load(store.workspaceId) } })
        if (store.status === 'error') return e('div', { className: 'll-page' }, e('div', { className: 'll-card ll-error', role: 'alert' }, '无法连接 LearnLoop / Cannot connect to LearnLoop: ' + store.error, e('div', null, e('button', { className: 'll-btn', onClick: function () { load(store.workspaceId) } }, '重试 / Retry'))))
        if (!store.workspaceId) return e('div', { className: 'll-empty' }, e('h2', null, '未找到 Workspace / No Workspace'), e('p', { className: 'll-small' }, '当前 Session 尚未归属 Workspace，请先在侧栏选择 Workspace。 / Select a Workspace for this Session first.'))
        return props.children(store.value)
      }
      // Stored data from another epoch: the Host starts degraded and only this explicit action moves the old file to a backup.
      async function resetIncompatibleStorage() { const response = await fetch(MANAGE, { method: 'POST', headers: MUTATION_HEADERS, body: JSON.stringify({ action: 'reset-incompatible-storage' }) }); const payload = await response.json().catch(function () { return null }); if (!response.ok) throw new Error(payload && payload.error ? payload.error.message : 'HTTP ' + response.status); return payload }
      function IncompatibleStorage(props) { const state = React.useState({ busy: false, error: null }), info = props.info || {}; function reset() { if (!window.confirm('清除旧版本的 LearnLoop 数据？旧数据会移到 ~/.dsh/learnloop/stale-backups，不会删除，但新版本无法再读取。 / Clear the old LearnLoop data? It is moved to ~/.dsh/learnloop/stale-backups, not deleted, but this version cannot read it.')) return; state[1]({ busy: true, error: null }); resetIncompatibleStorage().then(function () { state[1]({ busy: false, error: null }); props.onReset() }).catch(function (x) { state[1]({ busy: false, error: String(x && x.message || x) }) }) } return e('div', { className: 'll-page' }, e('div', { className: 'll-card ll-error', role: 'alert' }, e('h3', null, '学习数据版本不兼容 / Incompatible learning data'), e('p', null, '已保存的数据来自另一个 LearnLoop 版本（存储版本 ' + info.storedUnitVersion + '，当前需要 ' + info.expectedUnitVersion + '），无法读取，也不会被自动转换。 / The stored data is from another LearnLoop version (storage ' + info.storedUnitVersion + ', expected ' + info.expectedUnitVersion + ') and is not converted automatically.'), state[0].error && e('p', { className: 'll-small' }, state[0].error), e('button', { className: 'll-btn ll-btn-danger', disabled: state[0].busy, onClick: reset }, state[0].busy ? '正在清除… / Clearing…' : '清除旧数据 / Clear old data'))) }
      function Header(title, project) { return e('header', null, e('h2', null, title), project && e('div', { className: 'll-row' }, e('span', null, project.title), e('span', { className: 'll-badge' }, project.phase))) }
