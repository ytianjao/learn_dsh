import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './e2e', use: { baseURL: process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080', trace: 'retain-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} }, outputDir: 'test-results' })
