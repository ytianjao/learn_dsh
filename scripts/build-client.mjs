// Build client/bundle.js from client/src/ source modules.
// Each source file contributes code at the 6-space indent level inside the factory IIFE.
// Run directly: node scripts/build-client.mjs
import {readFileSync, writeFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

const HEADER = `/* Prebuilt DSH Web client module. Keep this file dependency-free: DSH loads it directly. */
window.__ModuleLoader__.load({
  id: '@learnloop/dsh-learnloop',
  factory: function (require) {
    const module = { exports: {} }
    module.exports = function () {
      const React = require('react')
      const e = React.createElement\n`

const FOOTER = `    }()
    return module.exports
  }
})
`

const srcDir = 'client/src'
const files = readdirSync(srcDir).filter(f => f.endsWith('.js')).sort()
const body = files.map(f => readFileSync(join(srcDir, f), 'utf8')).join('')
writeFileSync('client/bundle.js', HEADER + body + FOOTER, 'utf8')
console.log(`Built client/bundle.js from ${files.length} source modules (client/src/)`)
