// Bring an existing checkout up to date, run by `npm run dev-deps` before the stack starts.
//
// dev/init-env.sh writes a complete .env, but it also picks new ports, so a checkout created before a
// key was added keeps an .env without it — and dev/resources/users.json is rendered, no longer
// committed, so a pull deletes it. This adds the missing keys, derived from the checkout's own base
// port as init-env.sh would, and renders users.json from the .env as it is. Existing keys are never
// changed.
import { readFileSync, appendFileSync } from 'node:fs'
import { renderUsers } from './render-users.mjs'

const raw = readFileSync('.env', 'utf8')
/** @type {Record<string, string>} */
const env = {}
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
if (!env.DEV_HOST || !env.NGINX_PORT1) {
  console.error('.env has no DEV_HOST or NGINX_PORT1: run ./dev/init-env.sh')
  process.exit(1)
}

// keep in sync with dev/init-env.sh
const defaults = {
  MCP_PORT: String(Number(env.NGINX_PORT1) + 39),
  AGENTS_IMAGE: 'ghcr.io/data-fair/agents:feat-autonomous-agents',
  MCP_IMAGE: 'ghcr.io/data-fair/mcp:feat-openapi-mcp'
}
const missing = Object.entries(defaults).filter(([key]) => !(key in env))
if (missing.length) {
  appendFileSync('.env', (raw.endsWith('\n') ? '' : '\n') + missing.map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
  console.log(`added to .env: ${missing.map(([key]) => key).join(', ')}`)
}

renderUsers({ DEV_HOST: env.DEV_HOST, NGINX_PORT1: env.NGINX_PORT1 })
