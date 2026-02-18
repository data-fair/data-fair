import path from 'node:path'
import { readFileSync } from 'node:fs'
import config from '../../api/src/config.ts'
import mongo from '../../api/src/mongo.ts'
import es from '../../api/src/es.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import nock from 'nock'
import { pendingTasks } from '../../api/src/workers/tasks.ts'
import { reset as resetPing } from '@data-fair/data-fair-api/src/workers/ping.ts'
import { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import debugModule from 'debug'
import * as app from '../../api/src/app.js'
import * as rateLimiting from '../../api/src/misc/utils/rate-limiting.ts'

import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { memoizedGetPublicationSiteSettings } from '@data-fair/data-fair-api/src/misc/utils/settings.ts'
import testEvents from '@data-fair/data-fair-api/src/misc/utils/test-events.ts'
export { config }

const geocoderApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../test-it/resources/geocoder-api.json'), 'utf8'))
const sireneApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../test-it/resources/sirene-api.json'), 'utf8'))

const debug = debugModule('test')

const axiosOpts = { baseURL: config.publicUrl }

export const getAxios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })

export const getAxiosAuth = async (email: string, password = 'passwd', org?: string, adminMode = false, opts = {}) => {
  return axiosAuth({
    email,
    password,
    directoryUrl: config.directoryUrl,
    org,
    axiosOpts: { ...axiosOpts, headers: { 'x-cache-bypass': '1' }, ...opts },
    adminMode
  })
}

let appStarted = false

export const startApiServer = async () => {
  if (appStarted) return
  debug('preparing mocks')

  nock('http://test.com')
    .persist()
    .get('/geocoder/api-docs.json').reply(200, geocoderApi)
    .get('/sirene/api-docs.json').reply(200, sireneApi)

  nock('http://test-catalog.com')
    .persist()
    .get('/api/1/site/').reply(200, { title: 'My catalog' })
    .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{ name: 'Koumoul' }])
    .get('/api/1/datasets/suggest/?q=test').reply(200, [{ title: 'Test dataset' }])

  nock('http://not-a-catalog.com')
    .persist()

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
  nock('http://monapp1.com/')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/dir1/info.txt').query(true).reply(200, 'into txt dir1')
    .get('/config-schema.json').query(true).reply(200, {
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
    })
  nock('http://monapp2.com')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/config-schema.json').query(true).reply(200, {})
  nock('http://monapp3.com')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/config-schema.json').query(true).reply(200, {
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
                  // eslint-disable-next-line no-template-curly-in-string
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
    })

  debug('mocks ok')

  debug('init globals')
  await mongo.init()
  await es.init()

  debug('init globals ok')

  debug('scratch all')
  await mongo.db.dropDatabase()
  await es.client.indices.delete({ index: 'dataset-test-*', ignore_unavailable: true }).catch(err => { console.log(err) })
  debug('scratch all ok')

  debug('run app')
  try {
    await app.run()
  } catch (err) {
    console.error('Failed to run the application', err)
    throw err
  }
  debug('app ok')

  appStarted = true
}

export const stopApiServer = async () => {
  if (!appStarted) return
  debug('stop app')
  await Promise.race([
    new Promise(resolve => setTimeout(resolve, 5000)),
    app.stop()
  ])
  debug('stop app ok')

  debug('cleanup globals')
  await es.client.close()
  await mongo.client.close()
  debug('cleanup globals ok')

  appStarted = false
}

export const scratchData = async () => {
  debug('force reset the workers')
  await resetPing()

  debug('scratch data')
  try {
    await Promise.all([
      mongo.datasets.deleteMany({}),
      mongo.applications.deleteMany({}),
      mongo.applicationsKeys.deleteMany({}),
      mongo.limits.deleteMany({}),
      mongo.settings.deleteMany({}),
      mongo.db.collection('locks').deleteMany({}),
      mongo.db.collection('extensions-cache').deleteMany({}),
      mongo.remoteServices.deleteMany({ id: /dataset:(.*)/ }),
      mongo.db.collection('journals').deleteMany({}),
      fs.emptyDir('../data/test-tmp'),
      filesStorage.removeDir(path.resolve('../data/test'))
    ])
    await fs.emptyDir('../data/test')
    memoizedGetPublicationSiteSettings.clear()
    rateLimiting.clear()
  } catch (err) {
    console.warn('error while scratching data before test', err)
  }
  testEvents.removeAllListeners()
  debug('scratch data ok')
}

export const checkPendingTasks = (testName: string) => {
  for (const pending of Object.values(pendingTasks)) {
    if (Object.keys(pending).length > 0) throw new Error(`the test "${testName}" didn't wait for some pending tasks (${JSON.stringify(pendingTasks)})`)
  }

  if (config.filesStorage === 's3') {
    if ((fs.existsSync(config.dataDir) && fs.readdirSync(config.dataDir).length)) {
      throw new Error(`the test "${testName}" created some files in dataDir, that should not happen when using S3`)
    }
  }
}

export const formHeaders = (form: FormData) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  return headers
}

export const sendDataset = async (fileName: string, ax: AxiosInstance, opts?: AxiosRequestConfig, body?: any) => {
  const workers = await import('../../api/src/workers/index.ts')
  const datasetFd = fs.readFileSync(path.resolve('./test-it/resources/', fileName))
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  if (body) form.append('body', JSON.stringify(body))
  const res = await ax.post('/api/v1/datasets', form, { ...opts, headers: formHeaders(form) })
  return workers.hook(`finalize/${res.data.id}`)
}

export const timeout = (promise: Promise<any>, delay = 1000, message = 'time limit exceeded') => {
  const error = new Error(message)
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
  return Promise.race([promise, timeoutPromise])
}
