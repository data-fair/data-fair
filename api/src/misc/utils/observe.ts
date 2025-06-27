// TODO: replace this with @data-fair/lib-node/observer.js

import client from 'prom-client'
import debug from 'debug'
import { type Request } from 'express'
import { reqUser } from '@data-fair/lib-express'

const debugReq = debug('df:observe:req')

const reqStepHisto = new client.Histogram({
  name: 'df_req_step_seconds',
  help: 'Duration in seconds of steps in API requests',
  buckets: [0.03, 0.1, 1, 10, 60],
  labelNames: ['routeName', 'step']
})

const reqObserveKey = Symbol('reqObserveKey')

export const observeReqMiddleware = (req, res, next) => {
  const start = Date.now()
  req[reqObserveKey] = { start, step: start }
  res.on('finish', () => {
    reqStep(req, 'finish')
    reqStep(req, 'total')
  })
  next()
}

export const reqRouteName = (req, routeName) => {
  req[reqObserveKey].routeName = routeName
}

export const reqStep = (req: Request, stepName: string) => {
  if (!req.route) return
  if (!req[reqObserveKey].routeName) req[reqObserveKey].routeName = req.route.path

  const now = Date.now()
  const duration = now - (stepName === 'total' ? req[reqObserveKey].start : req[reqObserveKey].step)
  reqStepHisto.labels(Array.isArray(req[reqObserveKey].routeName) ? req[reqObserveKey].routeName[0] : req[reqObserveKey].routeName, stepName).observe(duration / 1000)
  debugReq('request', req.method, req.originalUrl, stepName, duration, 'ms')
  if (duration > 1000 && stepName !== 'total' && stepName !== 'finish') {
    const referer = req.headers.referer || req.headers.referrer || 'unknown'
    const user = reqUser(req)
    const userStr = user ? `${user.name}(${user.id})` : 'anonymous'
    console.log(`slow request ${req.method} ${req.originalUrl} ${stepName} ${duration}ms referer=${referer} user=${userStr}`)
  }
  req[reqObserveKey].step = now
}
