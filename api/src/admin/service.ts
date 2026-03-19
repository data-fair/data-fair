import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import axios from '../misc/utils/axios.js'
import fs from 'fs-extra'
import * as clamav from '../misc/utils/clamav.ts'
import filesStorage from '#files-storage'
import debugModule from 'debug'

const debug = debugModule('status')

async function mongoStatus (req: any) {
  debug('mongoStatus ?')
  await mongo.db.command({ ping: 1 })
  debug('mongoStatus ok')
}

async function esStatus (req: any) {
  debug('esStatus ?')
  const es = req.app.get('es')
  const health = await es.cluster.health()
  const healthStatus = health?.status
  if (healthStatus === 'green') {
    // OK
  } else if (config.elasticsearch.acceptYellowStatus && healthStatus === 'yellow') {
    // OK
  } else {
    throw new Error('Health status is ' + healthStatus)
  }
  debug('esStatus ok')
  /* since v8 ingest-attachment is no longer a plugin, it is pre-packaged
  const ingestAttachment = (await es.cat.plugins({ format: 'json' })).find(p => p.component === 'ingest-attachment')
  if (!ingestAttachment) throw new Error('Ingest attachment plugin is not installed.')
  */
}

async function jwksStatus (req: any) {
  debug('jwksStatus ?')
  const jwksRes = (await axios.get((config.privateDirectoryUrl || config.directoryUrl) + '/.well-known/jwks.json')).data
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
  debug('jwksStatus ok')
}

async function nuxtStatus (req: any) {
  debug('nuxtStatus ?')
  if (process.env.NODE_ENV === 'development') return
  const nuxtConfig = (await import('@data-fair/data-fair-ui/nuxt.config.js')).default
  const dir = nuxtConfig.buildDir || '.nuxt'
  await fs.writeFile(`${dir}/check-access.txt`, 'ok')
  if (req.app.get('nuxt')) await req.app.get('nuxt').renderRoute('/')
  debug('nuxtStatus ok')
}

async function dataDirStatus (req: any) {
  debug('dataDirStatus ?')
  await filesStorage.checkAccess()
  debug('dataDirStatus ok')
}

async function singleStatus (req: any, fn: (req: any) => Promise<void>, name: string) {
  const time = moment()
  try {
    await fn(req)
    return { status: 'ok', name, timeInMs: moment().diff(time) }
  } catch (err) {
    return { status: 'error', message: (err as Error).toString(), name, timeInMs: moment().diff(time) }
  }
}

export async function getStatus (req: any) {
  const promises = [
    singleStatus(req, mongoStatus, 'mongodb'),
    singleStatus(req, esStatus, 'elasticsearch'),
    singleStatus(req, jwksStatus, 'auth-directory'),
    singleStatus(req, dataDirStatus, 'data-dir')
  ]
  if (!config.proxyNuxt) {
    promises.push(singleStatus(req, nuxtStatus, 'nuxt'))
  }
  if (config.clamav.active) {
    promises.push(singleStatus(req, clamav.ping, 'clamav'))
  }
  const results = await Promise.all(promises)

  const errors = results.filter(r => r.status === 'error')
  if (errors.length) console.error('status has errors', errors)
  return {
    status: errors.length ? 'error' : 'ok',
    message: errors.length ? ('Problem with : ' + errors.map(s => s.name).join(', ')) : 'Service is ok',
    details: results
  }
}
