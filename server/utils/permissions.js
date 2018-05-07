const config = require('config')
const express = require('express')
const permissionsSchema = require('../../contract/permissions.json')
const apiDocsUtil = require('./api-docs')
const ajv = require('ajv')()
const validate = ajv.compile(permissionsSchema)

exports.middleware = function(operationId, permissionClass) {
  return function(req, res, next) {
    if (!exports.can(req.resource, operationId, permissionClass, req.user)) {
      res.status(403)
      const operation = apiDocsUtil.operations(req.resourceApiDoc).find(o => o.id === operationId)
      if (operation) res.send(`Permission manquante pour l'opération "${operation.title}" ou la catégorie "${permissionClass}"`)
      else res.send(`Permission manquante pour cette opération ou la catégorie "${permissionClass}"`)
      return
    }
    next()
  }
}

// resource can be an application, a dataset of an remote service
exports.can = function(resource, operationId, permissionClass, user) {
  const operationPermissions = (resource.permissions || []).filter(p => p.operations && p.operations.indexOf(operationId) >= 0)
  const permissionClasses = (resource.permissions || []).filter(p => p.classes && p.classes.indexOf(permissionClass) >= 0)
  const matchingPermissions = operationPermissions.concat(permissionClasses)
  // check if the operation is public
  if (matchingPermissions.find(p => !p.type && !p.id)) return true
  if (!user) {
    return false
  } else {
    // Check if the user is the owner of the resource
    if (resource.owner.type === 'user' && resource.owner.id === user.id) return true
    // Check if the user is admin in an organization that have the resource
    if (resource.owner.type === 'organization') {
      const userOrga = user.organizations.find(o => o.id === resource.owner.id)
      if (userOrga && userOrga.role === config.adminRole) return true
    }
    // Check if user have permissions
    if (matchingPermissions.find(p => p.type === 'user' && p.id === user.id)) return true
    if (matchingPermissions.find(p => {
      const orgaUser = p.type === 'organization' && user.organizations.find(o => o.id === p.id)
      return orgaUser && ((!p.roles || !p.roles.length) || p.roles.indexOf(orgaUser.role) >= 0)
    })) return true
    return false
  }
}

// list permissions of a user over a resource
exports.list = function(resource, user) {
  const permissions = {
    public: (resource.permissions || []).filter(p => !p.type && !p.id && p.operations && p.operations.length).map(p => p.operations),
    user: (user && (resource.permissions || []).filter(p => p.type === 'user' && p.id === user.id && p.operations && p.operations.length).map(p => p.operations)) || [],
    isOwner: false,
    organizations: {}
  }

  // Check if the user is the owner of the resource
  if (user && resource.owner.type === 'user' && resource.owner.id === user.id) permissions.isOwner = true
  // Check if the user is admin in an organization that have the resource
  if (resource.owner.type === 'organization') {
    const userOrga = user && user.organizations.find(o => o.id === resource.owner.id)
    if (userOrga && userOrga.role === config.adminRole) permissions.isOwner = true
  }

  (resource.permissions || []).filter(p => p.type === 'organization').forEach(p => {
    const orgaUser = user && user.organizations.find(o => o.id === p.id)
    if (orgaUser && ((orgaUser.role === config.adminRole) || (!p.roles || !p.roles.length) || p.roles.indexOf(orgaUser.role) >= 0)) {
      if (p.operations && p.operations.length) {
        permissions.organizations[orgaUser.id] = permissions.organizations[orgaUser.id] || []
        permissions.organizations[orgaUser.id].push(p.operations)
      }
    }
  })

  // TODO 'all' does not exists anymore, we could simplify following code
  const reducer = (accumulator, currentValue) => (accumulator === 'all' || currentValue === 'all') ? 'all' : accumulator.concat(currentValue)
  permissions.public = permissions.public.reduce(reducer, [])
  permissions.user = permissions.user.reduce(reducer, [])
  Object.keys(permissions.organizations).forEach(o => {
    permissions.organizations[o] = permissions.organizations[o].reduce(reducer, [])
  })
  permissions.summary = (permissions.isOwner && 'owner') || [].concat(permissions.public, permissions.user, ...Object.values(permissions.organizations)).reduce(reducer, [])

  return permissions
}

// Manage filters for datasets, applications and remote services
exports.filter = function(user, showPublic) {
  const operationFilter = [{operations: 'list'}, {classes: 'list'}]

  const or = []
  if (showPublic || !user) {
    or.push({permissions: {
      $elemMatch: {$or: operationFilter, type: null, id: null}
    }})
  }

  if (user) {
    // user is owner
    or.push({
      'owner.type': 'user',
      'owner.id': user.id
    })
    // user is admin of owner organization
    or.push({
      'owner.type': 'organization',
      'owner.id': {$in: user.organizations.filter(o => o.role === config.adminRole).map(o => o.id)}
    })

    // user has specific permission to read
    or.push({
      permissions: {
        $elemMatch: {$or: operationFilter, type: 'user', id: user.id}
      }
    })
    user.organizations.forEach(o => {
      or.push({
        permissions: {
          $elemMatch: {
            $and: [
              {$or: operationFilter},
              {$or: [{roles: o.role}, {roles: {$size: 0}}]}
            ],
            type: 'organization',
            id: o.id
          }
        }
      })
    })
  }
  return or
}

// Test if user is owner or belong to the owner organization
// Should we deprecate this since we have a more general function that list permissions and tells if we are owner above ?
// See the settings router that still use this function
exports.isOwner = function(owner, user) {
  if (!user) return false
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    return userOrga && userOrga.role === config.adminRole
  }
  return false
}

// Only operationId level : it is used only for creation of resources and
// setting screen only set creation permissions at operationId level
exports.canDoForOwner = async function(owner, operationId, user, db) {
  if (!user) return false
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    if (userOrga) {
      if (userOrga.role === config.adminRole) return true
      const settings = await db.collection('settings').findOne({id: owner.id, type: owner.type})
      const operationsPermissions = settings.operationsPermissions && settings.operationsPermissions[operationId]
      if (operationsPermissions) return operationsPermissions.indexOf(userOrga.role) >= 0
    }
  }
  return false
}

module.exports.router = (collectionName, resourceName) => {
  const router = express.Router()

  router.get('', exports.middleware('getPermissions', 'admin'), async (req, res, next) => {
    res.status(200).send(req[resourceName].permissions || [])
  })

  // update settings
  router.put('', exports.middleware('setPermissions', 'admin'), async (req, res, next) => {
    let valid = validate(req.body)
    if (!valid) return res.status(400).send(validate.errors)
    req.body = req.body || []
    req.body.forEach(permission => {
      if ((!permission.type && permission.id) || (permission.type && !permission.id)) valid = false
    })
    if (!valid) return res.status(400).send('Error in permissions format')
    const resources = req.app.get('db').collection(collectionName)
    try {
      await resources.updateOne({
        id: req[resourceName].id
      }, {$set: {permissions: req.body}})
      res.status(200).send(req.body)
    } catch (err) {
      next(err)
    }
  })

  return router
}

module.exports.apiDoc = {
  get: {
    summary: 'Récupérer la liste des permissions.',
    operationId: 'getPermissions',
    'x-permissionClass': 'admin',
    security: [{ jwt: [] }],
    tags: ['Permissions'],
    responses: {
      200: {
        description: 'Liste des permissions',
        content: {
          'application/json': {
            schema: permissionsSchema
          }
        }
      }
    }
  },
  put: {
    summary: 'Définir la liste des permissions.',
    operationId: 'setPermissions',
    'x-permissionClass': 'admin',
    security: [{ jwt: [] }],
    tags: ['Permissions'],
    requestBody: {
      description: 'Liste des permissions',
      required: true,
      content: {
        'application/json': {
          schema: permissionsSchema
        }
      }
    },
    responses: {
      200: {
        description: 'Liste des permissions',
        content: {
          'application/json': {
            schema: permissionsSchema
          }
        }
      }
    }
  }
}
