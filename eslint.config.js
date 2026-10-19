import tseslint from 'typescript-eslint'
export default tseslint.config(
  { files: ['src/**/*.ts', 'tests/**/*.ts'], languageOptions: { parser: tseslint.parser }, rules: { 'no-constant-condition': 'error' } },
  // Rules that need type information run on the typed Host project: an unhandled Promise, a Promise where a callback must return void, and a switch over a union that misses a member.
  { files: ['src/**/*.ts'], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }, plugins: { '@typescript-eslint': tseslint.plugin }, rules: { '@typescript-eslint/no-floating-promises': 'error', '@typescript-eslint/no-misused-promises': 'error', '@typescript-eslint/switch-exhaustiveness-check': 'error' } },
)
