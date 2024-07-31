// A middleware that accepts an api key from the settings of a user/orga
// and create a session with a pseudo user
const crypto = require('crypto')
const config = require('config')
const createError = require('http-errors')
const asyncWrap = require('../utils/async-handler')

exports.readApiKey = async (db, rawApiKey, scope, asAccount, req) => {
  if (req?.resource?._readApiKey && (req.resource._readApiKey.current === rawApiKey || req.resource._readApiKey.previous === rawApiKey)) {
    req.bypassPermissions = { classes: ['read'] }
    const user = { isApiKey: true, id: 'readApiKey', title: 'Read API key for specifc resource' }
    return user
  } else {
    const hash = crypto.createHash('sha512')
    hash.update(rawApiKey)
    const hashedApiKey = hash.digest('hex')
    const settings = await db.collection('settings')
      .findOne({ 'apiKeys.key': hashedApiKey }, { projection: { _id: 0, id: 1, type: 1, department: 1, name: 1, 'apiKeys.$': 1 } })
    if (!settings) throw createError(401, 'Cette clé d\'API est inconnue.')
    const apiKey = settings.apiKeys[0]
    if (!apiKey.scopes.includes(scope)) throw createError(403, 'Cette clé d\'API n\'a pas la portée nécessaire.')

    let user
    if (apiKey.adminMode && apiKey.asAccount) {
      if (!asAccount) throw createError(403, 'Cette clé d\'API requiert de spécifier le compte à incarner')
      const account = typeof asAccount === 'string' ? JSON.parse(asAccount) : asAccount
      user = { isApiKey: true }
      if (account.type === 'user') {
        user.id = account.id
        user.name = `${account.name} (${apiKey.title})`
        user.organizations = []
        user.activeAccount = { type: 'user', id: user.id, name: user.name }
      } else {
        user.id = 'apiKey:' + apiKey.id
        user.name = apiKey.title
        user.organization = { id: account.id, name: account.name, role: config.adminRole }
        if (account.department) {
          user.organization.department = account.department
          if (account.departmentName) user.organization.departmentName = account.departmentName
        }
        user.organizations = [user.organization]
        user.activeAccount = { ...user.organization, type: 'organization' }
      }
    } else {
      if (asAccount) throw createError(403, 'Cette clé d\'API ne supporte pas de spécifier le compte à incarner')
      user = { adminMode: !!apiKey.adminMode, isApiKey: true }
      if (settings.type === 'user') {
        user.id = settings.id
        user.name = `${settings.name} (${apiKey.title})`
        user.organizations = []
        user.activeAccount = { type: 'user', id: user.id, name: user.name }
      } else {
        user.id = 'apiKey:' + apiKey.id
        user.name = apiKey.title
        user.organization = { id: settings.id, name: settings.name, role: config.adminRole }
        if (settings.department) {
          user.organization.department = settings.department
          if (settings.departmentName) user.organization.departmentName = settings.departmentName
        }
        user.organizations = [user.organization]
        user.activeAccount = { ...user.organization, type: 'organization' }
      }
    }
    return user
  }
}

exports.middleware = (scope) => {
  return asyncWrap(async (req, res, next) => {
    const reqApiKey = req.get('x-apiKey') || req.get('x-api-key') || req.query.apiKey
    if (reqApiKey) req.user = await exports.readApiKey(req.app.get('db'), reqApiKey, scope, req.get('x-account') || req.query.account, req)
    next()
  })
}
