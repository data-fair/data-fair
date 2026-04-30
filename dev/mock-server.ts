// A simple mock HTTP server that serves responses for external services
// used during development and testing. Started as part of dev-deps.
// Replaces the in-process nock mocks from the old test setup.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = parseInt(process.env.MOCK_PORT || '8999')
const mockOrigin = `http://localhost:${port}`

// Load API docs and patch server URLs to point to this mock server
const geocoderApi = JSON.parse(readFileSync(resolve(__dirname, '../tests/resources/geocoder-api.json'), 'utf8'))
geocoderApi.servers = [{ url: `${mockOrigin}/geocoder`, description: 'Mock server' }]

const sireneApi = JSON.parse(readFileSync(resolve(__dirname, '../tests/resources/sirene-api.json'), 'utf8'))
sireneApi.servers = [{ url: `${mockOrigin}/sirene`, description: 'Mock server' }]

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

const monapp1ConfigSchema = {
  type: 'object',
  required: ['datasets'],
  properties: {
    datasets: {
      type: 'array',
      items: [
        {
          title: 'Jeu de données',
          description: 'Ce jeu doit contenir au moins une colonne avec valeur numérique',
          type: 'object',
          'x-fromUrl': 'api/v1/datasets?status=finalized&field-type=integer,number&q={q}&select=id,title,schema,userPermissions&{context.datasetFilter}',
          'x-itemsProp': 'results',
          'x-itemTitle': 'title',
          'x-itemKey': 'href',
          additionalProperties: false,
          properties: {
            href: { type: 'string' },
            title: { type: 'string' },
            id: { type: 'string' },
            finalizedAt: { type: 'string' }
          }
        },
        {
          title: 'Jeu de données de contribution',
          type: 'object',
          'x-fromUrl': 'api/v1/datasets?status=finalized&q={q}&select=id,title,schema,userPermissions&{context.datasetFilter}',
          'x-itemsProp': 'results',
          'x-itemTitle': 'title',
          'x-itemKey': 'href',
          additionalProperties: false,
          properties: {
            href: { type: 'string' },
            title: { type: 'string' },
            id: { type: 'string' },
            finalizedAt: { type: 'string' },
            applicationKeyPermissions: {
              type: 'object',
              const: { operations: ['readSafeSchema', 'createLine'] }
            }
          }
        }
      ]
    }
  }
}

const monapp3ConfigSchema = {
  type: 'object',
  required: ['datasets'],
  allOf: [
    {
      title: 'Source des données',
      properties: {
        datasets: {
          type: 'array',
          items: {
            title: 'Jeu de données',
            type: 'object',
            properties: {
              href: { type: 'string' },
              title: { type: 'string' },
              id: { type: 'string' },
              schema: { type: 'array' }
            }
          },
          layout: {
            getItems: {
              url: 'api/v1/datasets?status=finalized,indexed,updated&q={q}&select=id,title,schema&\\${context.datasetFilter}&size=100&sort=createdAt:-1',
              itemKey: 'data.href',
              itemTitle: 'data.title',
              itemsResults: 'data.results'
            }
          }
        }
      }
    },
    {
      title: 'Métriques',
    }
  ],
  $id: 'config-schema',
  layout: 'tabs'
}

type NdjsonEchoConfig = {
  fields: Record<string, any>
  indexFields?: string[]  // fields modified by line index: numbers get multiplied, strings get index appended
}

type RouteResult = {
  status: number
  body?: any
  bodyBase64?: string
  contentType?: string
  delay?: number
  ndjsonEcho?: NdjsonEchoConfig
  once?: boolean
}

const staticRoutes: Record<string, () => RouteResult> = {
  // Remote services API docs (patched to use mock server URLs)
  '/geocoder/api-docs.json': () => ({ status: 200, body: geocoderApi }),
  '/sirene/api-docs.json': () => ({ status: 200, body: sireneApi }),

  // Geocoder proxy endpoints (for remote service proxy forwarding)
  '/geocoder/coord': () => ({ status: 200, body: {} }),

  // Catalog
  '/catalog/api/1/site/': () => ({ status: 200, body: { title: 'My catalog' } }),
  '/catalog/api/1/organizations/suggest/': () => ({ status: 200, body: [{ name: 'Koumoul' }] }),
  '/catalog/api/1/datasets/suggest/': () => ({ status: 200, body: [{ title: 'Test dataset' }] }),

  // App test1
  '/monapp1/index.html': () => ({ status: 200, body: html, contentType: 'text/html' }),
  '/monapp1/config-schema.json': () => ({ status: 200, body: monapp1ConfigSchema }),
  '/monapp1/dir1/info.txt': () => ({ status: 200, body: 'into txt dir1', contentType: 'text/plain' }),

  // App test2
  '/monapp2/index.html': () => ({ status: 200, body: html, contentType: 'text/html' }),
  '/monapp2/config-schema.json': () => ({ status: 200, body: {} }),

  // App test3
  '/monapp3/index.html': () => ({ status: 200, body: html, contentType: 'text/html' }),
  '/monapp3/config-schema.json': () => ({ status: 200, body: monapp3ConfigSchema }),
}

// Dynamic routes registered by tests via /_test/routes API
// These override static routes and are cleared between tests.
// Keys can be pathname only or pathname+query (e.g., '/geocoder/coords?select=lat,lon')
let dynamicRoutes: Record<string, RouteResult> = {}

// Collected request bodies for dynamic routes (for assertions in tests)
let receivedRequests: Array<{ path: string, method: string, body: any }> = []

function readBody (req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function sendResult (res: ServerResponse, result: RouteResult) {
  const contentType = result.contentType || 'application/json'
  res.writeHead(result.status, { 'Content-Type': contentType })
  if (result.bodyBase64) {
    res.end(Buffer.from(result.bodyBase64, 'base64'))
  } else {
    res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
  }
}

function findDynamicRoute (pathname: string, search: string): { result: RouteResult, key: string } | undefined {
  // Try exact match with query string first, then pathname only
  if (search) {
    const key = pathname + search
    if (dynamicRoutes[key]) return { result: dynamicRoutes[key], key }
  }
  if (dynamicRoutes[pathname]) return { result: dynamicRoutes[pathname], key: pathname }
  return undefined
}

function handleNdjsonEcho (bodyStr: string, config: NdjsonEchoConfig): string {
  const inputs = bodyStr.trim().split('\n').map(line => JSON.parse(line))
  const indexFields = new Set(config.indexFields || [])
  return inputs.map((input, i) => {
    const result: Record<string, any> = { key: input.key }
    for (const [k, v] of Object.entries(config.fields)) {
      if (indexFields.has(k)) {
        result[k] = typeof v === 'number' ? v * i : v + '' + i
      } else {
        result[k] = v
      }
    }
    return JSON.stringify(result)
  }).join('\n') + '\n'
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`)
  const pathname = url.pathname

  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }

  // Dynamic route management API
  if (pathname === '/_test/routes' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    dynamicRoutes[body.path] = {
      status: body.status || 200,
      body: body.body,
      bodyBase64: body.bodyBase64,
      contentType: body.contentType,
      delay: body.delay,
      ndjsonEcho: body.ndjsonEcho,
      once: body.once
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  if (pathname === '/_test/routes' && req.method === 'DELETE') {
    dynamicRoutes = {}
    receivedRequests = []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  // Return collected requests (for test assertions)
  if (pathname === '/_test/received' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(receivedRequests))
    return
  }

  if (pathname === '/_test/received' && req.method === 'DELETE') {
    receivedRequests = []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  // Check dynamic routes first (they override static ones)
  const dynamicMatch = findDynamicRoute(pathname, url.search)
  if (dynamicMatch) {
    const { result: dynamicResult, key: routeKey } = dynamicMatch
    // Remove one-shot routes after matching
    if (dynamicResult.once) delete dynamicRoutes[routeKey]
    // Collect request body for POST/PUT/PATCH to dynamic routes
    let bodyStr = ''
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      bodyStr = await readBody(req)
      try {
        receivedRequests.push({ path: pathname, method: req.method, body: JSON.parse(bodyStr) })
      } catch {
        receivedRequests.push({ path: pathname, method: req.method, body: bodyStr })
      }
    }
    if (dynamicResult.delay) {
      await new Promise(resolve => setTimeout(resolve, dynamicResult.delay))
    }
    // ndjsonEcho: parse ndjson input, echo back key + configured fields per line
    if (dynamicResult.ndjsonEcho && bodyStr) {
      const output = handleNdjsonEcho(bodyStr, dynamicResult.ndjsonEcho)
      res.writeHead(dynamicResult.status || 200, { 'Content-Type': 'application/x-ndjson' })
      res.end(output)
      return
    }
    sendResult(res, dynamicResult)
    return
  }

  // Check static routes
  const staticHandler = staticRoutes[pathname]
  if (staticHandler) {
    sendResult(res, staticHandler())
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(port, () => {
  console.log(`Mock server listening on port ${port}`)
})
