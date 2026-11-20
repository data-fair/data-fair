import { test as base, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { anonymousAx, apiUrl } from '../support/axios.ts'
import { devLogFile } from '../support/dev-logs.ts'

const apiStartedAt = async () => (await anonymousAx.get(`${apiUrl}/api/v1/test-env/started-at`)).data.startedAt as string

// the last lines of a dev process log (dev/logs/<name>.log written by `npm run dev`, see devLogFile), or nothing
const paneLogs = async (pane: 'api' | 'mock', lines: number) => {
  const content = await readFile(devLogFile(pane), 'utf8').catch(() => '')
  return content.split('\n').slice(-lines).join('\n')
}

/**
 * The `test` of every api and e2e spec. On a failure it attaches what tells a regression from an
 * environment problem: the api and mock logs, the worker tasks still pending, and whether the
 * API restarted during the test (nodemon reacting to an edit in the checkout).
 */
export const test = base.extend<{ diagnostics: void }>({
  diagnostics: [async ({}, use, testInfo) => {
    // the API may be mid-restart when the test starts: the test itself will say so
    const startedAt = await apiStartedAt().catch((err: Error) => `unreachable (${err.message})`)
    await use()
    if (testInfo.status === testInfo.expectedStatus) return
    const [api, mock] = await Promise.all([paneLogs('api', 200), paneLogs('mock', 50)])
    if (api) await testInfo.attach('api.log', { body: api, contentType: 'text/plain' })
    if (mock) await testInfo.attach('mock.log', { body: mock, contentType: 'text/plain' })
    const pending = await anonymousAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`).then(res => res.data, (err: Error) => err.message)
    await testInfo.attach('pending-tasks.json', { body: JSON.stringify(pending, null, 2), contentType: 'application/json' })
    const startedAtAfter = await apiStartedAt().catch((err: Error) => `unreachable (${err.message})`)
    if (startedAtAfter !== startedAt) {
      // the attachment name is what the dot reporter prints under the failure
      await testInfo.attach('the API restarted during this test, re-run it: not a regression', {
        body: `started at ${startedAt}, now ${startedAtAfter}: probably nodemon reacting to an edit in the checkout`,
        contentType: 'text/plain'
      })
    }
  }, { auto: true }]
})

export { expect }
