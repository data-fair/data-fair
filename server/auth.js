const expressJWT = require('express-jwt')
const config = require('config')
const jwksRsa = require('jwks-rsa')

function getToken(req) {
  return req.cookies.id_token || (req.headers && req.headers.authorization && req.headers.authorization.split(' ').pop())
}

module.exports.jwtMiddleware = expressJWT({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: config.directoryUrl + '/.well-known/jwks.json'
  }),
  getToken
})

module.exports.optionalJwtMiddleware = expressJWT({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: config.directoryUrl + '/.well-known/jwks.json'
  }),
  credentialsRequired: false,
  getToken
})
