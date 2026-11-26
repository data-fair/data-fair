import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { devLogFile } from '../../support/dev-logs.ts'

const configDir = path.resolve(import.meta.dirname, '../../../api/config')
const configModule = pathToFileURL(createRequire(path.join(configDir, 'x.js')).resolve('config')).href
const defaultEnv = Object.fromEntries(fs.readFileSync(path.resolve(import.meta.dirname, '../../../dev/default.env'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=') as [string, string]))

// node-config caches its result and development.mjs reads .env: resolve the config in a child process started in an empty directory
const loadConfig = (env: Record<string, string>) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-config-'))
  const script = `import config from ${JSON.stringify(configModule)}; process.stdout.write(JSON.stringify(config))`
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd,
    env: { PATH: process.env.PATH ?? '', NODE_CONFIG_DIR: configDir, NODE_ENV: 'development', ...defaultEnv, ...env },
    encoding: 'utf8'
  })
  fs.rmSync(cwd, { recursive: true, force: true })
  return JSON.parse(out)
}

test.describe('development config', () => {
  test('an optional service with an empty port is absent', () => {
    const config = loadConfig({ EVENTS_PORT: '', AGENTS_PORT: '', REGISTRY_PORT: '', CAPTURE_PORT: '', OAV_PORT: '' })
    for (const key of ['privateEventsUrl', 'privateAgentsUrl', 'privateRegistryUrl', 'privateCaptureUrl', 'privateOpenapiViewerUrl']) {
      assert.equal(config[key], null, key)
    }
  })

  test('an optional service with a port is plugged', () => {
    const config = loadConfig({ EVENTS_PORT: '5613' })
    assert.equal(config.privateEventsUrl, 'http://localhost:5613')
    assert.equal(config.privateAgentsUrl, `http://localhost:${defaultEnv.AGENTS_PORT}`)
  })

  test('production env variables override the dev defaults', () => {
    const config = loadConfig({ MONGO_URL: 'mongodb://localhost:1/x' })
    assert.equal(config.mongo.url, 'mongodb://localhost:1/x')
  })

  test('the dev logs are in dev/logs unless DEV_LOG_DIR and DEV_LOG_PREFIX say otherwise', () => {
    const saved = { dir: process.env.DEV_LOG_DIR, prefix: process.env.DEV_LOG_PREFIX }
    try {
      delete process.env.DEV_LOG_DIR
      delete process.env.DEV_LOG_PREFIX
      assert.equal(devLogFile('api'), path.join('dev/logs', 'api.log'))
      process.env.DEV_LOG_DIR = '/var/log/df'
      process.env.DEV_LOG_PREFIX = 'df-'
      assert.equal(devLogFile('mock'), '/var/log/df/df-mock.log')
    } finally {
      for (const [key, value] of [['DEV_LOG_DIR', saved.dir], ['DEV_LOG_PREFIX', saved.prefix]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
