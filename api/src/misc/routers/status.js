import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import axios from '../utils/axios.js'
import fs from 'fs-extra'
import * as clamav from '../utils/clamav.ts'

async function mongoStatus (req) {
  await mongo.db.command({ ping: 1 })
}

async function esStatus (req) {
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
  /* since v8 ingest-attachment is no longer a plugin, it is pre-packaged
  const ingestAttachment = (await es.cat.plugins({ format: 'json' })).find(p => p.component === 'ingest-attachment')
  if (!ingestAttachment) throw new Error('Ingest attachment plugin is not installed.')
  */
}

async function jwksStatus (req) {
  const jwksRes = (await axios.get((config.privateDirectoryUrl || config.directoryUrl) + '/.well-known/jwks.json')).data
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
}

async function nuxtStatus (req) {
  if (process.env.NODE_ENV === 'test') return
  const nuxtConfig = (await import('@data-fair/data-fair-ui/nuxt.config.js')).default
  const dir = nuxtConfig.buildDir || '.nuxt'
  await fs.writeFile(`${dir}/check-access.txt`, 'ok')
  if (req.app.get('nuxt')) await req.app.get('nuxt').renderRoute('/')
}

async function dataDirStatus (req) {
  const dir = config.dataDir
  await fs.writeFile(`${dir}/check-access.txt`, 'ok')
}

async function singleStatus (req, fn, name) {
  const time = moment()
  try {
    await fn(req)
    return { status: 'ok', name, timeInMs: moment().diff(time) }
  } catch (err) {
    return { status: 'error', message: err.toString(), name, timeInMs: moment().diff(time) }
  }
}

async function getStatus (req) {
  const promises = [
    singleStatus(req, mongoStatus, 'mongodb'),
    singleStatus(req, esStatus, 'elasticsearch'),
    singleStatus(req, jwksStatus, 'auth-directory'),
    singleStatus(req, nuxtStatus, 'nuxt'),
    singleStatus(req, dataDirStatus, 'data-dir')
  ]
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

export const status = async (req, res, next) => {
  const status = await getStatus(req)
  res.send(status)
}

export const ping = async (req, res, next) => {
  const status = await getStatus(req)
  if (status.status === 'error') res.status(500)
  res.send(status.status)
}
