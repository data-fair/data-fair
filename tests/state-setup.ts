import assert from 'node:assert/strict'
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
If you are an agent, read its logs with "npx --no df-dev logs api" and report the problem to your user (or "npx --no df-dev restart api" if the pane exited).
Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)

  // Check that the mock server is up
  await assert.doesNotReject(
    ax.get(`${mockUrl}/geocoder/api-docs.json`),
    `Mock server seems to be unavailable at ${mockUrl}. If you are an agent, read its logs with "npx --no df-dev logs mock" (or "npx --no df-dev restart mock" if the pane exited).`
  )
})
