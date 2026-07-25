import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const tsx = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
const script = path.join(process.cwd(), 'scripts', 'backfill-tasks-from-knowledge.ts')
const result = spawnSync(process.execPath, [tsx, script, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env })
process.exitCode = result.status ?? 1
