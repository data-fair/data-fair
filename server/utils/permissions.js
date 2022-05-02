const config = require('config')
const express = require('express')
const permissionsSchema = require('../../contract/permissions.json')
const apiDocsUtil = require('./api-docs')
const visibilityUtils = require('./visibility')
const ajv = require('ajv')()
const validate = ajv.compile(permissionsSchema)

exports.middleware = function (operationId, operationClass, trackingCategory) {
  return function (req, res, next) {
    if (
      exports.can(req.resourceType, req.resource, operationId, req.user) ||
      (req.bypassPermissions && req.bypassPermissions.operations && req.bypassPermissions.operations.includes(operationId)) ||
      (req.bypassPermissions && req.bypassPermissions.classes && req.bypassPermissions.classes.includes(operationClass))
    ) {
      // nothing to do, user can proceed
    } else {
      res.status(403)
      const denomination = {
        datasets: 'Le jeu de données',
        applications: 'L\'application',
        catalogs: 'Le connecteur'
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
      return res.send(`Permission manquante pour l'opération "${operationId}" ou la catégorie "${operationClass}".`)
    }

    // this is stored here to be used by cache headers utils to manage public cache
    req.publicOperation = exports.can(req.resourceType, req.resource, operationId, null)

    // these headers can be used to apply other permission/quota/metrics on the gateway
    if (req.resource) res.setHeader('x-resource', JSON.stringify({ type: req.resourceType, id: req.resource.id, title: encodeURIComponent(req.resource.title) }))
    if (req.resource && req.resource.owner) res.setHeader('x-owner', JSON.stringify({ type: req.resource.owner.type, id: req.resource.owner.id }))
    req.operation = { class: operationClass, id: operationId, track: trackingCategory }
    res.setHeader('x-operation', JSON.stringify(req.operation))
    next()
  }
}

const getOwnerRole = exports.getOwnerRole = (owner, user) => {
  if (!user) return null
  // user is implicitly admin of his own resources, even if he is currently switched to an organization
  if (owner.type === 'user') {
    if (owner.id === user.id) return config.adminRole
    return null
  }
  // user current activeAccount and owner dot not match, the user is not better than anonymous
  if (user.activeAccount.type !== owner.type || user.activeAccount.id !== owner.id) return null

  // user is in a department but the resource belongs either to no department or to another department
  // user is implicitly of the lowest role
  if (user.activeAccount.department && user.activeAccount.department !== owner.department) return config.userRole
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
exports.can = function (resourceType, resource, operationId, user) {
  if (user && user.adminMode) return true
  const userPermissions = exports.list(resourceType, resource, user)
  return !!userPermissions.includes(operationId)
}

// list operations a user can do with a resource
exports.list = function (resourceType, resource, user) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const ownerClasses = getOwnerClasses(resource.owner, user, resourceType)
  if (ownerClasses) return [].concat(...ownerClasses.map(cl => operationsClasses[cl]))
  const permissions = (resource.permissions || []).filter(p => matchPermission(resource.owner, p, user))
  return [].concat(...permissions.map(p => (p.operations || []).concat(...(p.classes || []).map(c => operationsClasses[c]))))
}

// resource is public if there are public permissions for all operations of the classes 'read' and 'use'
// list is not here as someone can set a resource publicly usable but not appearing in lists
exports.isPublic = function (resourceType, resource) {
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
exports.filter = function (user) {
  const operationFilter = [{ operations: 'list' }, { classes: 'list' }]
  const or = [visibilityUtils.publicFilter]

  if (user) {
    // user is in super admin mode, show all
    if (user.adminMode) {
      or.push({ 'owner.type': { $exists: true } })
    } else {
      if (!user.organization) {
        // user is owner
        or.push({ 'owner.type': 'user', 'owner.id': user.id })
      }
      if (user.organization) {
        // user is member of owner organization
        or.push({ 'owner.type': 'organization', 'owner.id': user.organization.id })
      }

      if (!user.organization) {
        // user has specific permission to read
        or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: user.id } } })
      }
      if (user.organization) {
        // user's orga has specific permission to read
        const filters = [
          // check that the permission applies to the current org of the user
          { type: 'organization', id: user.organization.id },
          // check that the permission applies to the current operation (through its class or operation id)
          { $or: operationFilter },
          // either the permission is not specific to a role or it matches the user's role in the organization
          { $or: [{ roles: user.organization.role }, { roles: { $size: 0 } }] }
        ]
        /* TODO: adapt explicit permissions for organizations with departments
        if (user.organization.department) {
          // if the user is in a department only permissions explicitly targetted to his department concern hime
          filters.push({ departments: user.organization.department })
        } */
        or.push({ permissions: { $elemMatch: { $and: filters } } })
      }
    }
  }
  return or
}

// Only operationId level : it is used only for creation of resources and
// setting screen only set creation permissions at operationId level
exports.canDoForOwner = function (owner, resourceType, operationClass, user) {
  if (user && user.adminMode) return true
  const ownerClasses = getOwnerClasses(owner, user, resourceType)
  return ownerClasses && ownerClasses.includes(operationClass)
}

module.exports.router = (resourceType, resourceName, onPublicCallback) => {
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
      const resource = await req[resourceName]
      const wasPublic = exports.isPublic(resourceType, resource)
      const willBePublic = exports.isPublic(resourceType, { permissions: req.body })

      // re-publish to catalogs if public/private was switched
      if (['datasets', 'applications'].includes(resourceType)) {
        if (wasPublic !== willBePublic) {
          await resources.updateOne(
            { id: resource.id, 'publications.status': 'published' },
            { $set: { 'publications.$.status': 'waiting' } }
          )
        }
      }

      await resources.updateOne({ id: resource.id }, { $set: { permissions: req.body } })

      if (!wasPublic && willBePublic && onPublicCallback) {
        await onPublicCallback(req, { ...resource, permissions: req.body })
      }

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
