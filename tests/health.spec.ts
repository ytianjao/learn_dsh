import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('repository health', () => {
  it('declares the project name in the README heading', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')

    expect(readme.split(/\r?\n/, 1)[0]).toBe('# LearnLoop for DeepSeek Harness')
  })
})
