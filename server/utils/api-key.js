// A middleware that accepts an api key from the settings of a user/orga
// and create a session with a pseudo user
const crypto = require('crypto')
const asyncWrap = require('../utils/async-wrap')

module.exports = (scope) => {
  return asyncWrap(async (req, res, next) => {
    const apiKey = req.get('x-apiKey')
    if (!apiKey) return next()
    const hash = crypto.createHash('sha512')
    hash.update(apiKey)
    const hashedApiKey = hash.digest('hex')
    const settings = await req.app.get('db').collection('settings')
      .findOne({ 'apiKeys.key': hashedApiKey }, { projection: { _id: 0, id: 1, type: 1, name: 1, 'apiKeys.$': 1 } })
    if (!settings) return res.status(401).send('Cette clé d\'API est inconnue.')
    if (!settings.apiKeys[0].scopes.includes(scope)) return res.status(403).send('Cette clé d\'API n\'a pas la portée nécessaire.')
    if (settings.type === 'user') {
      req.user = { id: settings.id, name: settings.name, organizations: [], isApiKey: true }
    } else {
      const organization = { id: settings.id, name: settings.name, role: 'admin' }
      req.user = { id: settings.id, name: settings.apiKeys[0].title, organization, organizations: [organization], isApiKey: true }
      req.headers['x-organizationid'] = settings.id
    }
    next()
  })
}
