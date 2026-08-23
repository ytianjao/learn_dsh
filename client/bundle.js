/* Prebuilt DSH Web client module. This script is loaded directly by the
 * browser, so it must register itself instead of relying on CommonJS globals. */
window.__ModuleLoader__.load({
  id: '@learnloop/dsh-learnloop',
  factory: function (require) {
    const module = { exports: {} }
    module.exports = function () {
  const React = require('react')
  const stores = new Map()
  const manager = { open: false, listeners: new Set() }
  function storeFor(workspaceId) {
    const key = workspaceId || '__manager__'
    if (!stores.has(key)) stores.set(key, { workspaceId, value: null, loading: false })
    return stores.get(key)
  }
  async function load(workspaceId) {
    const store = storeFor(workspaceId)
    if (!workspaceId) return store
    store.loading = true
    const response = await fetch('/learnloop/api/v2/state?workspaceId=' + encodeURIComponent(workspaceId))
    if (!response.ok) throw new Error('LearnLoop state request failed')
    store.value = await response.json(); store.loading = false
    return store
  }
  function useWorkspace(props) {
    const workspaceId = props.workspaceId
    const [, redraw] = React.useReducer(x => x + 1, 0)
    React.useEffect(() => { let active = true; load(workspaceId).then(() => active && redraw()); return () => { active = false } }, [workspaceId])
    return storeFor(workspaceId)
  }
  function Launcher(props) {
    const store = useWorkspace(props), project = store.value && store.value.activeProject
    return React.createElement('button', { onClick: () => props.inputActions && props.inputActions.submit && (props.inputActions.setDraft('我想主动开启 LearnLoop 学习模式。请调用 learnloop_begin_onboarding，然后使用 ask_user_question 逐步访谈。'), props.inputActions.submit()) }, project ? '继续学习' : '开启学习模式')
  }
  function WorkspaceView(props) {
    const store = useWorkspace(props), value = store.value
    if (!value) return React.createElement('div', null, '正在同步 LearnLoop…')
    const project = value.activeProject
    return React.createElement('main', null, React.createElement('h2', null, project ? project.title : '还没有学习项目'), project && React.createElement('p', null, project.profile ? project.profile.goal : '正在建立学习档案'), project && React.createElement('p', null, '阶段：' + project.phase))
  }
  function ManagerAction() { return React.createElement('button', { onClick: () => { manager.open = true; manager.listeners.forEach(fn => fn()) } }, '学习计划') }
  function ManagerView(props) { const [, redraw] = React.useReducer(x => x + 1, 0); React.useEffect(() => { manager.listeners.add(redraw); return () => manager.listeners.delete(redraw) }, []); return manager.open ? React.createElement(WorkspaceView, props) : null }
  const inject = ['slots']
  function apply(ctx) {
    const slots = ctx.get('slots'); if (!slots) return
    slots.inject('conversation.input.left', () => slots.register({ name: 'conversation.input.left', id: 'learnloop-launcher', order: -10 }, Launcher))
    slots.inject('conversation.view', () => slots.register({ name: 'conversation.view', id: 'learnloop-manager', order: 20, label: '学习计划 / Learning Plan' }, ManagerView))
    slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'learnloop-plans', order: 20, label: '学习计划' }, ManagerAction))
    slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'learnloop', order: 25, label: 'LearnLoop' }, () => React.createElement('p', null, 'LearnLoop v0.2.0')))
  }
      return { inject, apply }
    }()
    return module.exports
  }
})
