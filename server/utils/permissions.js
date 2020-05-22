const config = require('config')
const express = require('express')
const permissionsSchema = require('../../contract/permissions.json')
const apiDocsUtil = require('./api-docs')
const visibilityUtils = require('./visibility')
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

    // this is stored here to be used by cache headers utils to manage public cache
    req.publicOperation = exports.can(req.resource, operationId, permissionClass, null)

    next()
  }
}

// TODO: only apply permissions of current active account
const isOwner = exports.isOwner = function(owner, user) {
  if (!user) return false
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    return userOrga && (!owner.role || userOrga.role === config.adminRole || userOrga.role === owner.role)
  }
  return false
}

// TODO: simplify by only applying permissions of current active account
// resource can be an application, a dataset or an remote service
exports.can = function(resource, operationId, permissionClass, user) {
  const operationPermissions = (resource.permissions || []).filter(p => p.operations && p.operations.indexOf(operationId) >= 0)
  const permissionClasses = (resource.permissions || []).filter(p => p.classes && p.classes.indexOf(permissionClass) >= 0)
  const matchingPermissions = operationPermissions.concat(permissionClasses)
  // check if the operation is public
  if (matchingPermissions.find(p => !p.type && !p.id)) return true
  if (!user) {
    return false
  } else {
    // User is in super admin mode
    if (user.adminMode) return true
    // Check if the user is the owner of the resource
    if (isOwner(resource.owner, user)) return true
    // Check if user have permissions
    if (matchingPermissions.find(p => p.type === 'user' && p.id === user.id)) return true
    if (matchingPermissions.find(p => {
      const orgaUser = p.type === 'organization' && user.organizations.find(o => o.id === p.id)
      return orgaUser && ((!p.roles || !p.roles.length) || orgaUser.role === config.adminRole || p.roles.indexOf(orgaUser.role) >= 0)
    })) return true
    return false
  }
}

// TODO: simplify by only applying permissions of current active account
// list operations a user can do with a resource
exports.list = function(resource, operationsClasses, user) {
  if (isOwner(resource.owner, user) || (user && user.adminMode)) {
    return [].concat(...Object.values(operationsClasses))
  } else {
    const permissionOperations = p => (p.operations || []).concat(...(p.classes || []).map(c => operationsClasses[c]))
    const permissions = {
      public: [].concat(...(resource.permissions || []).filter(p => !p.type && !p.id).map(permissionOperations)),
      user: (user && [].concat(...(user && (resource.permissions || []).filter(p => p.type === 'user' && p.id === user.id).map(permissionOperations)))) || [],
      organizations: {},
    };

    (resource.permissions || []).filter(p => p.type === 'organization').forEach(p => {
      const orgaUser = user && user.organizations.find(o => o.id === p.id)
      if (orgaUser && ((orgaUser.role === config.adminRole) || (!p.roles || !p.roles.length) || p.roles.indexOf(orgaUser.role) >= 0)) {
        permissions.organizations[orgaUser.id] = [].concat(...permissions.organizations[orgaUser.id] || [], permissionOperations(p))
      }
    })
    return [].concat(permissions.public, permissions.user, ...Object.values(permissions.organizations)).filter((o, i, s) => s.indexOf(o) === i)
  }
}

// resource is public if there are public permissions for all operations of the classes 'read' and 'use'
// list is not here as someone can set a resource publicly usable but not appearing in lists
exports.isPublic = function(resource, operationsClasses) {
  const permissionOperations = p => (p.operations || []).concat(...(p.classes || []).map(c => operationsClasses[c]))
  const publicOperations = new Set([].concat(operationsClasses.read || [], operationsClasses.use || []))
  const resourcePublicOperations = new Set([].concat(...(resource.permissions || []).filter(p => !p.type && !p.id).map(permissionOperations)))
  for (const op of publicOperations) {
    if (!resourcePublicOperations.has(op)) {
      return false
    }
  }
  return true
}

// Manage filters for datasets, applications and remote services
// this filter ensures that nobody can list something they are not permitted to list
exports.filter = function(user) {
  const operationFilter = [{ operations: 'list' }, { classes: 'list' }]
  const or = [visibilityUtils.publicFilter]

  if (user) {
    // user is in super admin mode, show all
    if (user.adminMode) {
      or.push({ 'owner.type': { $exists: true } })
    } else {
      if (!user.organization) {
        // user is owner
        or.push({
          'owner.type': 'user',
          'owner.id': user.id,
        })
      }
      if (user.organization && user.organization.role === config.adminRole) {
        // user is admin of owner organization
        or.push({
          'owner.type': 'organization',
          'owner.id': user.organization.id,
        })
      }
      if (user.organization && user.organization.role !== config.adminRole) {
        // organizations where user does not have admin role
        or.push({
          'owner.type': 'organization',
          'owner.id': user.organization.id,
          'owner.role': user.organization.role,
        })
        or.push({
          'owner.type': 'organization',
          'owner.id': user.organization.id,
          'owner.role': null,
        })
      }

      if (!user.organization) {
        // user has specific permission to read
        or.push({
          permissions: {
            $elemMatch: { $or: operationFilter, type: 'user', id: user.id },
          },
        })
      }
      if (user.organization) {
        // user's orga has specific permission to read
        or.push({
          permissions: {
            $elemMatch: {
              $and: [
                { $or: operationFilter },
                { $or: [{ roles: user.organization.role }, { roles: { $size: 0 } }] },
              ],
              type: 'organization',
              id: user.organization.id,
            },
          },
        })
      }
    }
  }
  return or
}

// Only operationId level : it is used only for creation of resources and
// setting screen only set creation permissions at operationId level
exports.canDoForOwner = async function(owner, operationId, user, db) {
  if (!user) return false
  if (user.adminMode) return true
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    if (userOrga) {
      if (userOrga.role === config.adminRole) return true
      const settings = await db.collection('settings').findOne({ id: owner.id, type: owner.type })
      const operationsPermissions = settings && settings.operationsPermissions && settings.operationsPermissions[operationId]
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
      // re-publish to catalogs if public/private was switched
      if (['datasets', 'applications'].includes(collectionName)) {
        const resource = await resources.findOne({ id: req[resourceName].id })
        const ops = apiDocsUtil.operationsClasses[collectionName]
        const wasPublic = exports.isPublic(resource, ops)
        const willBePublic = exports.isPublic({ permissions: req.body }, ops)
        if (wasPublic !== willBePublic) {
          await resources.updateOne({
            id: req[resourceName].id,
            'publications.status': 'published',
          }, { $set: { 'publications.$.status': 'waiting' } })
        }
      }

      await resources.updateOne({
        id: req[resourceName].id,
      }, { $set: { permissions: req.body } })

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
            schema: permissionsSchema,
          },
        },
      },
    },
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
          schema: permissionsSchema,
        },
      },
    },
    responses: {
      200: {
        description: 'Liste des permissions',
        content: {
          'application/json': {
            schema: permissionsSchema,
          },
        },
      },
    },
  },
}
