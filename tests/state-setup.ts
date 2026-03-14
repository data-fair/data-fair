import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn } from 'child_process'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { test as setup } from '@playwright/test'
import { apiUrl } from './support/axios.ts'

const anonymousDirectAx = axiosBuilder()

const geocoderApi = JSON.parse(readFileSync('./test-it/resources/geocoder-api.json', 'utf8'))
const sireneApi = JSON.parse(readFileSync('./test-it/resources/sirene-api.json', 'utf8'))

const html = `
  <html>
    <head>
      <meta name="application-name" content="test">
      <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
    </head>
    <body>My app body</body>
    <script>
      setTimeout(() => {
        if (window.triggerCapture) {
          window.triggerCapture()
        }
      }, 10)
    </script>
  </html>
`

setup('Stateful tests setup', async () => {
  // Check that the dev API server is up (use test-env/pending-tasks as a lightweight check
  // since /ping checks all sub-services like clamav which may not be running in dev)
  await assert.doesNotReject(
    anonymousDirectAx.get(`${apiUrl}/api/v1/test-env/pending-tasks`),
    `Dev API server seems to be unavailable at ${apiUrl}.
If you are an agent do not try to start it. Instead check for a startup failure at the end of dev/logs/dev-api.log and report this problem to your user.`
  )

  // Set up persistent nocks for external service mocks (geocoder, sirene, catalog, apps)
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://test.com',
    method: 'get',
    path: '/geocoder/api-docs.json',
    reply: { body: geocoderApi },
    persist: true
  })
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://test.com',
    method: 'get',
    path: '/sirene/api-docs.json',
    reply: { body: sireneApi },
    persist: true
  })
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://test-catalog.com',
    method: 'get',
    path: '/api/1/site/',
    reply: { body: { title: 'My catalog' } },
    persist: true
  })
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://test-catalog.com',
    method: 'get',
    path: '/api/1/organizations/suggest/',
    query: { q: 'koumoul' },
    reply: { body: [{ name: 'Koumoul' }] },
    persist: true
  })
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://test-catalog.com',
    method: 'get',
    path: '/api/1/datasets/suggest/',
    query: { q: 'test' },
    reply: { body: [{ title: 'Test dataset' }] },
    persist: true
  })

  // App mocks
  for (const appOrigin of ['http://monapp1.com', 'http://monapp2.com', 'http://monapp3.com']) {
    await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
      origin: appOrigin,
      method: 'get',
      path: '/index.html',
      reply: { body: html },
      persist: true
    })
    await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
      origin: appOrigin,
      method: 'get',
      path: '/config-schema.json',
      reply: { body: {} },
      persist: true
    })
  }
  // monapp1 extra
  await anonymousDirectAx.post(`${apiUrl}/api/v1/test-env/nock`, {
    origin: 'http://monapp1.com',
    method: 'get',
    path: '/dir1/info.txt',
    reply: { body: 'into txt dir1' },
    persist: true
  })

  // More visible dev api server logs straight in the test output
  try {
    const { existsSync, mkdirSync } = await import('node:fs')
    if (!existsSync('dev/logs')) mkdirSync('dev/logs', { recursive: true })
    const tail = spawn('tail', ['-n', '0', '-f', 'dev/logs/dev-api.log'], { stdio: 'inherit', detached: true })
    process.env.TAIL_PID = tail.pid?.toString()
  } catch {
    // log tailing is optional
  }
})
