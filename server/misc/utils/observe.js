// TODO: replace this with @data-fair/lib/node/observer.js

const client = require('prom-client')
const debugReq = require('debug')('df:observe:req')

const reqStep = new client.Histogram({
  name: 'df_req_step_seconds',
  help: 'Duration in seconds of steps in API requests',
  buckets: [0.03, 0.1, 1, 10, 60],
  labelNames: ['routeName', 'step']
})

const reqObserveKey = Symbol('reqObserveKey')

exports.observeReqMiddleware = (req, res, next) => {
  const start = Date.now()
  req[reqObserveKey] = { start, step: start }
  res.on('finish', () => {
    exports.reqStep(req, 'finish')
    exports.reqStep(req, 'total')
  })
  next()
}

exports.reqRouteName = (req, routeName) => {
  req[reqObserveKey].routeName = routeName
}

exports.reqStep = (req, stepName) => {
  if (!req.route) return
  if (!req[reqObserveKey].routeName) req[reqObserveKey].routeName = req.route.path

  const now = Date.now()
  const duration = now - (stepName === 'total' ? req[reqObserveKey].start : req[reqObserveKey].step)
  reqStep.labels(req[reqObserveKey].routeName, stepName).observe(duration / 1000)
  debugReq('request', req.method, req.originalUrl, stepName, duration, 'ms')
  if (duration > 1000 && stepName !== 'total' && stepName !== 'finish') {
    console.log('request', req.method, req.originalUrl, stepName, duration, 'ms')
  }
  req[reqObserveKey].step = now
}
