/**
 * A checkout whose .env predates the autonomous-agent stack must keep working after a pull:
 * dev/upgrade-env.mjs (run by `npm run dev-deps`) adds the keys its .env lacks and renders
 * dev/resources/users.json, which is no longer committed, from the .env as it is.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const script = path.resolve(import.meta.dirname, '../../../dev/upgrade-env.mjs')

const checkout = (env: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-upgrade-env-'))
  mkdirSync(path.join(dir, 'dev/resources'), { recursive: true })
  writeFileSync(path.join(dir, 'dev/resources/users.template.json'), '[{"id":"nhi","nhi":{"provider":{"issuer":"http://{DEV_HOST}:{NGINX_PORT1}/agents/api/nhi"}}}]\n')
  writeFileSync(path.join(dir, '.env'), env)
  return dir
}
const run = (dir: string) => execFileSync('node', [script], { cwd: dir, env: { PATH: process.env.PATH }, encoding: 'utf8' })

test.describe('dev env upgrade', () => {
  test('adds the keys an old .env lacks, from its own base port', () => {
    const dir = checkout('DEV_HOST=old.localhost\nNGINX_PORT1=20000\nAGENTS_PORT=20036\n')
    run(dir)
    const env = readFileSync(path.join(dir, '.env'), 'utf8')
    assert.match(env, /^MCP_PORT=20039$/m)
    assert.match(env, /^AGENTS_IMAGE=ghcr\.io\/data-fair\/agents:/m)
    assert.match(env, /^MCP_IMAGE=ghcr\.io\/data-fair\/mcp:/m)
    assert.match(env, /^AGENTS_PORT=20036$/m, 'existing keys are kept')
  })

  test('renders users.json from the .env as it is', () => {
    const dir = checkout('DEV_HOST=old.localhost\nNGINX_PORT1=20000\n')
    run(dir)
    const users = JSON.parse(readFileSync(path.join(dir, 'dev/resources/users.json'), 'utf8'))
    assert.equal(users[0].nhi.provider.issuer, 'http://old.localhost:20000/agents/api/nhi')
  })

  test('changes nothing in an up-to-date .env, and can run again', () => {
    const env = 'DEV_HOST=new.localhost\nNGINX_PORT1=30000\nMCP_PORT=31000\nAGENTS_IMAGE=a\nMCP_IMAGE=b\n'
    const dir = checkout(env)
    run(dir)
    run(dir)
    assert.equal(readFileSync(path.join(dir, '.env'), 'utf8'), env)
  })

  test('fails loudly without a .env', () => {
    const dir = checkout('')
    assert.throws(() => run(dir))
  })
})
