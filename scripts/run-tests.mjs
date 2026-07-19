import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = String(require('electron')).trim()
const result = spawnSync(
  electronPath,
  ['--import', 'tsx', '--test', 'tests/database-core.test.ts'],
  {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit'
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
