const config = require('config')
const moment = require('moment')
const axios = require('../utils/axios')
const fs = require('fs-extra')
const asyncWrap = require('../utils/async-wrap')
const clamav = require('../utils/clamav')

async function mongoStatus (req) {
  await req.app.get('db').command({ ping: 1 })
}

async function esStatus (req) {
  const es = req.app.get('es')
  await es.ping()
  const ingestAttachment = (await es.cat.plugins({ format: 'json' })).body.find(p => p.component === 'ingest-attachment')
  if (!ingestAttachment) throw new Error('Ingest attachment plugin is not installed.')
}

async function jwksStatus (req) {
  const jwksRes = (await axios.get((config.privateDirectoryUrl || config.directoryUrl) + '/.well-known/jwks.json')).data
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
}

async function nuxtStatus (req) {
  if (process.env.NODE_ENV === 'test') return
  const nuxtConfig = require('../../nuxt.config.js')
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

exports.status = asyncWrap(async (req, res, next) => {
  const status = await getStatus(req)
  res.send(status)
})

exports.ping = asyncWrap(async (req, res, next) => {
  const status = await getStatus(req)
  if (status.status === 'error') res.status(500)
  res.send(status.status)
})
