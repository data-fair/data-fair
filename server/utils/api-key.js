// A middleware that accepts an api key from the settings of a user/orga
// and create a session with a pseudo user
const crypto = require('crypto')
const config = require('config')
const asyncWrap = require('../utils/async-wrap')

module.exports = (scope) => {
  return asyncWrap(async (req, res, next) => {
    const reqApiKey = req.get('x-apiKey') || req.get('x-api-key') || req.query.apiKey
    if (!reqApiKey) return next()
    const hash = crypto.createHash('sha512')
    hash.update(reqApiKey)
    const hashedApiKey = hash.digest('hex')
    const settings = await req.app.get('db').collection('settings')
      .findOne({ 'apiKeys.key': hashedApiKey }, { projection: { _id: 0, id: 1, type: 1, name: 1, 'apiKeys.$': 1 } })
    if (!settings) return res.status(401).send('Cette clé d\'API est inconnue.')
    const apiKey = settings.apiKeys[0]
    if (!apiKey.scopes.includes(scope)) return res.status(403).send('Cette clé d\'API n\'a pas la portée nécessaire.')

    const asAccount = req.get('x-account') || req.query.account
    if (apiKey.adminMode && apiKey.asAccount) {
      if (!asAccount) return res.status(403).send('Cette clé d\'API requiert de spécifier le compte à incarner')
      const accountParts = asAccount.split(':')
      const account = { type: accountParts[0], id: accountParts[1] }
      req.user = {
        id: apiKey.id,
        name: apiKey.title,
        isApiKey: true,
      }
      if (account.type === 'user') {
        req.user.organizations = []
        req.user.activeAccount = { ...account, name: req.user.name }
      } else {
        req.user.organization = { id: account.id, role: config.adminRole }
        req.user.organizations = [req.user.organization]
        req.user.activeAccount = { ...req.user.organization, type: 'organization' }
      }
    } else {
      if (asAccount) return res.status(403).send('Cette clé d\'API ne supporte pas de spécifier le compte à incarner')
      req.user = {
        id: settings.id,
        name: apiKey.title,
        adminMode: !!apiKey.adminMode,
        isApiKey: true,
      }
      if (settings.type === 'user') {
        req.user.organizations = []
        req.user.activeAccount = { type: 'user', id: settings.id, name: req.user.name }
      } else {
        req.user.organization = { id: settings.id, name: settings.name, role: config.adminRole }
        req.user.organizations = [req.user.organization]
        req.user.activeAccount = { ...req.user.organization, type: 'organization' }
      }
    }
    next()
  })
}
