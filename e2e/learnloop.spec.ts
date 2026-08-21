import { expect, test, type Page } from '@playwright/test'

async function openLearnLoopOnboarding(page: Page) {
  const welcome = page.getByText(/^(你现在想学会什么？|What would you like to learn\?)$/)
  const workspaceDialog = page.getByRole('dialog', { name: /^(选择工作区目录|Select Workspace Directory)$/ })
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    if (await welcome.isVisible().catch(() => false)) return

    if (await workspaceDialog.isVisible().catch(() => false)) {
      const editPath = workspaceDialog.getByRole('button', { name: /^(编辑路径|Edit path)$/ })
      await editPath.click()
      const pathInput = workspaceDialog.getByRole('textbox', { name: /^(编辑路径|Edit path)$/ })
      await pathInput.fill(process.cwd())
      await pathInput.press('Enter')
      await workspaceDialog.getByRole('button', { name: /^(打开|Open)$/ }).click()
      await page.waitForTimeout(200)
      continue
    }

    for (const action of [
      page.getByText('Continue', { exact: true }),
      page.getByText('Configure later', { exact: true }),
      page.getByRole('textbox', { name: /^(选择工作区|Choose workspace)$/ }),
      page.getByRole('button', { name: 'Choose workspace', exact: true }),
    ]) {
      if (await action.isVisible().catch(() => false)) {
        await action.click()
        break
      }
    }

    await page.waitForTimeout(200)
  }

  await expect(welcome).toBeVisible()
}

test('creates a durable learning project and exposes all LearnLoop views', async ({ page }) => {
  await page.goto('/')
  await openLearnLoopOnboarding(page)
  if (await page.getByText('What would you like to learn?').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '中文' }).click()
  }
  await expect(page.getByText('你现在想学会什么？')).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByText('What would you like to learn?')).toBeVisible()
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByText('你现在想学会什么？')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/welcome.png', fullPage: true })
  await page.getByRole('region', { name: /LearnLoop 首次使用/ }).getByRole('textbox').fill('我有 5 年开发经验，做过 RAG；每周投入 10 小时，希望独立设计商业级 Agent 系统。')
  await page.getByRole('button', { name: '开始学习' }).click()
  await expect(page.getByText(/当前任务：/)).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/current-task.png', fullPage: true })
  const completionMutations: Array<{ action?: string; status?: string }> = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/learnloop/api/v1/state')) completionMutations.push(request.postDataJSON() as { action?: string; status?: string })
  })
  await page.getByRole('button', { name: '展开' }).click()
  page.once('dialog', dialog => dialog.accept('finish、status 和 checkpoint 分别负责终止、状态与恢复。'))
  await page.getByRole('button', { name: '完成并提交证据' }).click()
  await expect(page.getByText(/当前任务：.*Planner \/ Verifier/)).toBeVisible()
  expect(completionMutations.filter(item => item.action === 'complete-task-with-evidence')).toHaveLength(1)
  expect(completionMutations.some(item => item.action === 'evidence' || item.action === 'task-state' && item.status === 'completed')).toBe(false)
  await page.getByText('学习进度', { exact: true }).click()
  await expect(page.getByText('finish、status 和 checkpoint 分别负责终止、状态与恢复。')).toBeVisible()
  await page.getByRole('button', { name: '关闭 LearnLoop 视图' }).click()
  await page.getByText('学习计划', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '学习计划' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/plan.png', fullPage: true })
  await page.reload()
  await page.waitForTimeout(500)
  const laterAfterReload = page.getByText('Configure later', { exact: true })
  if (await laterAfterReload.isVisible().catch(() => false)) await laterAfterReload.click()
  await expect(page.getByText(/当前任务：.*Planner \/ Verifier/)).toBeVisible()
  await page.getByText('学习进度', { exact: true }).click()
  await expect(page.getByText('finish、status 和 checkpoint 分别负责终止、状态与恢复。')).toBeVisible()
  await expect(page.getByText('练习中').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/progress.png', fullPage: true })
  await page.getByRole('button', { name: '关闭 LearnLoop 视图' }).click()
  await page.getByText('复盘', { exact: true }).click()
  await expect(page.getByText('从真实学习事件重建')).toBeVisible()
})
