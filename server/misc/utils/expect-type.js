const debug = require('debug')('expect-type')

module.exports = (types) => {
  if (typeof types === 'string') types = [types]
  return (req, res, next) => {
    // content-type is only relevant for write operations
    if (req.method !== 'PUT' && req.method !== 'POST' && req.method !== 'PATCH') return next()
    // accept a list of types known to this api
    if (types.find(type => req.is(type))) return next()
    // if the body is empty the content-type doesn't really matter, it might be defined by default by the http client
    if (req.get('content-length') === '0') return next()
    res.status(415).send(req.__('errors.badContentType'))
    debug('expected content-type', types, req.get('content-type'))
  }
}
