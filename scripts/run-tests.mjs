import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = String(require('electron')).trim()
const testFiles = readdirSync('tests')
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => `tests/${file}`)
const result = spawnSync(electronPath, ['--import', 'tsx', '--test', ...testFiles], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
