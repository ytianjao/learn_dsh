import { expect, test, type Page } from '@playwright/test'

async function openLearnLoopOnboarding(page: Page) {
  const onboarding = page.getByRole('region', { name: 'LearnLoop onboarding' })
  const workspaceDialog = page.getByRole('dialog', { name: /^(选择工作区目录|Select Workspace Directory)$/ })
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    if (await onboarding.isVisible().catch(() => false)) return

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
        // The host can render its workspace control just beyond the viewport
        // while the navigation drawer is animating. A DOM click still follows
        // the same application path without Playwright waiting indefinitely for
        // the transient host layout to become actionable.
        await action.evaluate((element: HTMLElement) => element.click())
        break
      }
    }

    await page.waitForTimeout(200)
  }

  await expect(onboarding).toBeVisible()
}

test('creates a durable learning project while its model-generated plan is pending', async ({ page }) => {
  await page.goto('/')
  await openLearnLoopOnboarding(page)
  const onboarding = page.getByRole('region', { name: 'LearnLoop onboarding' })
  await expect(onboarding.getByRole('heading', { name: '选择你的学习方式' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/welcome.png', fullPage: true })
  await onboarding.getByRole('textbox', { name: /学习目标/ }).fill('独立设计商业级 Agent 系统。')
  await onboarding.getByRole('textbox', { name: /已有经验/ }).fill('我有 5 年开发经验，做过 RAG。')
  await expect(onboarding.getByRole('combobox', { name: '学习模式' })).toHaveValue('knowledge-first')
  await page.getByRole('button', { name: '开始学习' }).click()
  await expect(page.getByText('正在等待 DSH 模型生成学习计划')).toBeVisible()
  await page.screenshot({ path: 'test-results/screenshots/pending-plan.png', fullPage: true })
  await page.reload()
  await page.waitForTimeout(500)
  const laterAfterReload = page.getByText('Configure later', { exact: true })
  if (await laterAfterReload.isVisible().catch(() => false)) await laterAfterReload.click()
  await expect(page.getByText('正在等待 DSH 模型生成学习计划')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新请求生成计划' })).toBeVisible()
})
