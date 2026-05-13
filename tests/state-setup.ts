import assert from 'node:assert/strict'
import { spawn } from 'child_process'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { test as setup } from '@playwright/test'
import { apiUrl } from './support/axios.ts'

const ax = axiosBuilder()

const mockUrl = `http://localhost:${process.env.MOCK_PORT}`

setup('Stateful tests setup', async () => {
  // Wait for the dev API server to be up. It can be mid-restart (e.g. nodemon reacting
  // to UI build output during `npm run quality`), so we poll instead of probing once.
  const apiReadyUrl = `${apiUrl}/api/v1/test-env/pending-tasks`
  const apiReadyTimeoutMs = 30_000
  const apiReadyStart = Date.now()
  let lastErr: unknown
  while (Date.now() - apiReadyStart < apiReadyTimeoutMs) {
    try {
      await ax.get(apiReadyUrl)
      lastErr = undefined
      break
    } catch (err) {
      lastErr = err
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  assert.equal(lastErr, undefined, `Dev API server did not become available at ${apiUrl} within ${apiReadyTimeoutMs}ms.
If you are an agent do not try to start it. Instead check for a startup failure at the end of dev/logs/dev-api.log and report this problem to your user.
Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)

  // Check that the mock server is up
  await assert.doesNotReject(
    ax.get(`${mockUrl}/geocoder/api-docs.json`),
    `Mock server seems to be unavailable at ${mockUrl}. Start it with: node --experimental-strip-types dev/mock-server.ts`
  )

  // More visible dev server logs straight in the test output
  try {
    const { existsSync, mkdirSync } = await import('node:fs')
    if (!existsSync('dev/logs')) mkdirSync('dev/logs', { recursive: true })
    const tailApi = spawn('tail', ['-n', '0', '-f', 'dev/logs/dev-api.log'], { stdio: 'inherit', detached: true })
    process.env.TAIL_PIDS = [tailApi.pid].filter(Boolean).join(',')
  } catch {
    // log tailing is optional
  }
})
