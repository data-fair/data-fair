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
const geocoderApi = JSON.parse(readFileSync(resolve(__dirname, '../test-it/resources/geocoder-api.json'), 'utf8'))
geocoderApi.servers = [{ url: `${mockOrigin}/geocoder`, description: 'Mock server' }]

const sireneApi = JSON.parse(readFileSync(resolve(__dirname, '../test-it/resources/sirene-api.json'), 'utf8'))
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

type RouteResult = { status: number, body: any, contentType?: string, delay?: number }

const staticRoutes: Record<string, () => RouteResult> = {
  // Remote services API docs (patched to use mock server URLs)
  '/geocoder/api-docs.json': () => ({ status: 200, body: geocoderApi }),
  '/sirene/api-docs.json': () => ({ status: 200, body: sireneApi }),

  // Geocoder proxy endpoints (for remote service proxy forwarding)
  '/geocoder/coord': () => ({ status: 200, body: {} }),
  '/geocoder/coords': () => ({ status: 200, body: {} }),

  // Sirene proxy endpoints
  '/sirene/etablissements_bulk': () => ({ status: 200, body: {} }),

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
let dynamicRoutes: Record<string, RouteResult> = {}

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
  res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`)
  const pathname = url.pathname

  // Dynamic route management API
  if (pathname === '/_test/routes' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    dynamicRoutes[body.path] = {
      status: body.status || 200,
      body: body.body,
      contentType: body.contentType,
      delay: body.delay
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  if (pathname === '/_test/routes' && req.method === 'DELETE') {
    dynamicRoutes = {}
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  // Check dynamic routes first (they override static ones)
  const dynamicResult = dynamicRoutes[pathname]
  if (dynamicResult) {
    if (dynamicResult.delay) {
      await new Promise(resolve => setTimeout(resolve, dynamicResult.delay))
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
