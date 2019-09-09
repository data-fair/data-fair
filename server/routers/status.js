const config = require('config')
const moment = require('moment')
const rp = require('request-promise-native')
const asyncWrap = require('../utils/async-wrap')

async function mongoStatus(req) {
  await req.app.get('db').admin().serverStatus()
}

async function esStatus(req) {
  const es = req.app.get('es')
  await es.ping()
  const ingestAttachment = (await es.cat.plugins({ format: 'json' })).find(p => p.component === 'ingest-attachment')
  if (!ingestAttachment) throw new Error('Ingest attachment plugin is not installed.')
}

async function jwksStatus(req) {
  const jwksRes = await rp.get({ url: config.directoryUrl + '/.well-known/jwks.json', json: true })
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
}

async function singleStatus(req, fn, name) {
  const time = moment()
  try {
    await fn(req)
    return { status: 'ok', name, timeInMs: moment().diff(time) }
  } catch (err) {
    return { status: 'error', message: err.toString(), name, timeInMs: moment().diff(time) }
  }
}

async function getStatus(req) {
  const results = await Promise.all([
    singleStatus(req, mongoStatus, 'mongodb'),
    singleStatus(req, esStatus, 'elasticsearch'),
    singleStatus(req, jwksStatus, 'auth-directory')
  ])
  const errors = results.filter(r => r.status === 'error')
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

exports.ping = asyncWrap(async(req, res, next) => {
  const status = await getStatus(req)
  if (status.status === 'error') res.status(500).send(status)
  else res.send(status.status)
})
