const config = require('config')
const express = require('express')
const permissionsSchema = require('../../contract/permissions.json')
const apiDocsUtil = require('./api-docs')
const visibilityUtils = require('./visibility')
const ajv = require('ajv')()
const validate = ajv.compile(permissionsSchema)

exports.middleware = function(operationId, permissionClass) {
  return function(req, res, next) {
    if (req.method === 'GET' && req.bypassPermission) return next()
    if (!exports.can(req.resourceType, req.resource, operationId, req.user)) {
      res.status(403)
      const denomination = {
        datasets: 'Le jeu de données',
        applications: 'L\'application',
        catalogs: 'Le connecteur',
      }[req.resourceType]
      if (req.user && operationId === 'readDescription' && denomination) {
        if (req.resource.owner.type === 'user' && req.user.id === req.resource.owner.id) {
          return res.send(`${denomination} ${req.resource.title} appartient à votre compte personnel mais vous avez sélectionné une organisation comme compte actif.
    Sélectionnez votre compte personnel en tant que compte actif pour visualiser les informations.`)
        }
        if (req.resource.owner.type === 'organization' && req.user.organizations.find(o => o.id === req.resource.owner.id) && req.resource.owner.id !== req.user.activeAccount.id) {
          return res.send(`${denomination} ${req.resource.title} appartient à l'organisation ${req.resource.owner.name} dont vous êtes membre.
Sélectionnez l'organisation ${req.resource.owner.name} en tant que compte actif pour visualiser les informations.`)
        }
      }
      if (!req.user) {
        return res.send(`${denomination} n'est pas accessible publiquement. Veuillez vous connecter.`)
      }
      if (operationId === 'readDescription') {
        return res.send(`${denomination} est accessible uniquement aux utilisateurs autorisés par le propriétaire. Vous n'avez pas les permissions nécessaires pour visualiser les informations.`)
      }
      const operation = apiDocsUtil.operations(req.resourceApiDoc).find(o => o.id === operationId)
      if (operation) return res.send(`Permission manquante pour l'opération "${operation.title}" ou la catégorie "${permissionClass}".`)
      return res.send(`Permission manquante pour cette opération ou la catégorie "${permissionClass}".`)
    }

    // this is stored here to be used by cache headers utils to manage public cache
    req.publicOperation = exports.can(req.resourceType, req.resource, operationId, null)

    next()
  }
}

const getOwnerRole = exports.getOwnerRole = (owner, user) => {
  if (!user) return null
  if (user.activeAccount.type !== owner.type || user.activeAccount.id !== owner.id) return null
  if (user.activeAccount.type === 'user') return config.adminRole
  return user.activeAccount.role
}

const getOwnerClasses = (owner, user, resourceType) => {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const ownerRole = getOwnerRole(owner, user)
  if (!ownerRole) return null
  // classes of operations the user can do based on him being member of the resource's owner
  if (ownerRole === config.adminRole || (user && user.adminMode)) {
    return Object.keys(operationsClasses).concat(['post'])
  }
  if (ownerRole === config.contribRole) {
    return apiDocsUtil.contribOperationsClasses[resourceType] || []
  }
  return apiDocsUtil.userOperationsClasses[resourceType] || []
}

const matchPermission = (owner, permission, user) => {
  if (!permission.type && !permission.id) return true // public
  if (!user) return false
  if (user.activeAccount.type !== permission.type || user.activeAccount.id !== permission.id) return false
  if (permission.type === 'user') return true
  return !permission.role || user.activeAccount.role === config.adminRole || user.activeAccount.role === permission.role
}

// resource can be an application, a dataset or an remote service
exports.can = function(resourceType, resource, operationId, user) {
  if (user && user.adminMode) return true
  const userPermissions = exports.list(resourceType, resource, user)
  return !!userPermissions.includes(operationId)
}

// list operations a user can do with a resource
exports.list = function(resourceType, resource, user) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const ownerClasses = getOwnerClasses(resource.owner, user, resourceType)
  if (ownerClasses) return [].concat(...ownerClasses.map(cl => operationsClasses[cl]))
  const permissions = (resource.permissions || []).filter(p => matchPermission(resource.owner, p, user))
  return [].concat(...permissions.map(p => (p.operations || []).concat(...(p.classes || []).map(c => operationsClasses[c]))))
}

// resource is public if there are public permissions for all operations of the classes 'read' and 'use'
// list is not here as someone can set a resource publicly usable but not appearing in lists
exports.isPublic = function(resourceType, resource) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
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
      if (user.organization) {
        // user is member of owner organization
        or.push({
          'owner.type': 'organization',
          'owner.id': user.organization.id,
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
exports.canDoForOwner = function(owner, resourceType, operationClass, user) {
  const ownerClasses = getOwnerClasses(owner, user, resourceType)
  return ownerClasses && ownerClasses.includes(operationClass)
}

module.exports.router = (resourceType, resourceName) => {
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
    const resources = req.app.get('db').collection(resourceType)
    try {
      // re-publish to catalogs if public/private was switched
      if (['datasets', 'applications'].includes(resourceType)) {
        const resource = await resources.findOne({ id: req[resourceName].id })
        const wasPublic = exports.isPublic(resourceType, resource)
        const willBePublic = exports.isPublic(resourceType, { permissions: req.body })
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
