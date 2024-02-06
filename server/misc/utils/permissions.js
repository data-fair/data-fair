const config = require('config')
const express = require('express')
const permissionsSchema = require('../../../contract/permissions.json')
const apiDocsUtil = require('./api-docs')
const visibilityUtils = require('./visibility')
const ajv = require('./ajv')
const validate = ajv.compile(permissionsSchema)

exports.middleware = function (operationId, operationClass, trackingCategory, acceptMissing) {
  return function (req, res, next) {
    if ((acceptMissing && !req.resource)) return next()
    if (exports.can(req.resourceType, req.resource, operationId, req.user, req.bypassPermissions)) {
      // nothing to do, user can proceed
    } else {
      res.status(403).type('text/plain')
      const denomination = {
        datasets: 'Le jeu de données',
        applications: 'L\'application',
        catalogs: 'Le connecteur'
      }[req.resourceType] || 'La ressource'
      if (operationId === 'readDescription') {
        if (!req.user) {
          return res.send(`${denomination} n'est pas accessible publiquement. Veuillez vous connecter.`)
        }
        for (const org of req.user.organizations || []) {
          let name = org.name || org.id
          if (org.department) name += ' / ' + (org.departmentName || org.department)
          const altAccount = { id: req.user.id, activeAccount: { type: 'organization', ...org } }
          if (exports.can(req.resourceType, req.resource, operationId, altAccount, req.bypassPermissions)) {
            return res.send(`${denomination} ${req.resource.title} est accessible depuis l'organisation ${name} dont vous êtes membre mais vous ne l'avez pas sélectionné comme compte actif. Changez de compte pour visualiser les informations.`)
          }
        }
        return res.send(`${denomination} est accessible uniquement aux utilisateurs autorisés par le propriétaire. Vous n'avez pas les permissions nécessaires pour visualiser les informations.`)
      }
      return res.send(`Permission manquante pour l'opération "${operationId}" ou la catégorie "${operationClass}".`)
    }

    // this is stored here to be used by cache headers utils to manage public cache
    req.publicOperation = exports.can(req.resourceType, req.resource, operationId, null)

    // these headers can be used to apply other permission/quota/metrics on the gateway
    if (req.resource) res.setHeader('x-resource', JSON.stringify({ type: req.resourceType, id: req.resource.id, title: encodeURIComponent(req.resource.title) }))
    if (req.resource && req.resource.owner) {
      const ownerHeader = { type: req.resource.owner.type, id: req.resource.owner.id }
      if (req.resource.owner.department) ownerHeader.department = req.resource.owner.department
      res.setHeader('x-owner', JSON.stringify(ownerHeader))
    }
    req.operation = { class: operationClass, id: operationId, track: trackingCategory }
    res.setHeader('x-operation', JSON.stringify(req.operation))
    next()
  }
}

const getOwnerRole = exports.getOwnerRole = (owner, user, ignoreDepartment = false) => {
  if (!user || user.isApplicationKey || !user.activeAccount) return null

  // user is implicitly admin of his own resources, even if he is currently switched to an organization
  if (owner.type === 'user') {
    if (owner.id === user.id) return config.adminRole
    return null
  }
  // user current activeAccount and owner dot not match, the user is not better than anonymous
  if (user.activeAccount.type !== owner.type || user.activeAccount.id !== owner.id) return null

  // user is in a department but the resource belongs either to no department or to another department
  if (!ignoreDepartment && user.activeAccount.department && user.activeAccount.department !== owner.department) return null
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
  return null
}

const matchPermission = (owner, permission, user) => {
  if (!permission.type && !permission.id) return true // public
  if (!user || user.isApplicationKey || !user.activeAccount) return false

  // individual user permissions are applied no matter the current active account
  if (permission.type === 'user') {
    if (permission.id === '*') return true
    if (permission.email && permission.email === user.email) return true
    if (permission.id && permission.id === user.id) return true
    return false
  }

  // if a user is switched on an organization, permissions for his role in this organization apply
  // permissions for his other organizations do not apply
  if (permission.type === 'organization' && user.activeAccount.type === 'organization' && permission.id === user.activeAccount.id) {
    // department does not match
    if (user.activeAccount.department && permission.department && permission.department !== '*' && permission.department !== user.activeAccount.department) return false
    if (!permission.roles || !permission.roles.length) return true
    if (user.activeAccount.role === config.adminRole) return true
    if (permission.roles.includes(user.activeAccount.role)) return true
  }
  return false
}

// resource can be an application, a dataset or a remote service
exports.can = function (resourceType, resource, operationId, user, bypassPermissions) {
  if (user && user.adminMode) return true
  const userPermissions = exports.list(resourceType, resource, user, bypassPermissions)
  return !!userPermissions.includes(operationId)
}

// list operations a user can do with a resource
exports.list = function (resourceType, resource, user, bypassPermissions) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const operations = new Set([])

  // apply specific permissions from application key
  if (bypassPermissions) {
    for (const cl of bypassPermissions.classes || []) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
    for (const operation of bypassPermissions.operations || []) operations.add(operation)
    return [...operations]
  }

  // apply implicit permissions based on user being a member of the owner of this resource
  const ownerClasses = getOwnerClasses(resource.owner, user, resourceType)
  if (ownerClasses) {
    for (const cl of ownerClasses) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
  }

  // apply explicit permissions set on the resource for this user
  const permissions = (resource.permissions || []).filter(p => matchPermission(resource.owner, p, user))
  for (const permission of permissions) {
    for (const operation of permission.operations || []) operations.add(operation)
    for (const cl of permission.classes || []) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
  }
  return [...operations]
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
exports.filter = function (user, resourceType) {
  return [visibilityUtils.publicFilter].concat(exports.filterCan(user, resourceType, 'list'))
}

exports.filterCan = function (user, resourceType, operation = 'list') {
  const ignoreDepartment = resourceType === 'catalogs'

  const operationFilter = []
  for (const op of operation.split(',')) {
    const operationClass = apiDocsUtil.classByOperation[resourceType][op]
    if (operationClass) {
      operationFilter.push({ operations: op })
      operationFilter.push({ classes: operationClass })
    } else if (apiDocsUtil.operationsClasses[resourceType][operation]) {
      operationFilter.push({ classes: op })
    }
  }
  const or = []

  if (user) {
    or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: '*' } } })
    // user is in super admin mode, show all
    if (user.adminMode) {
      or.push({ 'owner.type': { $exists: true } })
    } else {
      // individual user permissions are applied no matter the current active account
      // user is owner
      or.push({ 'owner.type': 'user', 'owner.id': user.id })
      // user has specific permission to read, given by id or by email
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: user.id } } })
      if (user.email) or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', email: user.email } } })

      if (user.organization) {
        const listRoles = ['admin']
        if (resourceType && apiDocsUtil.contribOperationsClasses[resourceType] && apiDocsUtil.contribOperationsClasses[resourceType].includes('list')) {
          listRoles.push('contrib')
        }
        // user is privileged admin of owner organization with or without department
        if (listRoles.includes(user.organization.role)) {
          if (user.organization.department && !ignoreDepartment) or.push({ 'owner.type': 'organization', 'owner.id': user.organization.id, 'owner.department': user.organization.department })
          else or.push({ 'owner.type': 'organization', 'owner.id': user.organization.id })
        }

        // user's orga has specific permission to read
        const filters = [
          // check that the permission applies to the current org of the user
          { type: 'organization', id: user.organization.id },
          // check that the permission applies to the current operation (through its class or operation id)
          { $or: operationFilter },
          // either the permission is not specific to a role or it matches the user's role in the organization
          { $or: [{ roles: user.organization.role }, { roles: { $size: 0 } }, { roles: { $exists: false } }] }
        ]
        if (user.organization.department) {
          // either the permission is not specific to a department or it matches the user's department
          filters.push({ $or: [{ department: user.organization.department }, { department: '*' }, { department: { $exists: false } }] })
        }
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

exports.initResourcePermissions = async (resource) => {
  // initially give owner contribs permissions to write
  if (resource.owner.type === 'user') return
  const contribWritePermission = {
    type: resource.owner.type,
    id: resource.owner.id,
    name: resource.owner.name,
    department: resource.owner.department || '-',
    roles: ['contrib'],
    classes: ['write']
  }
  if (resource.owner.departmentName) contribWritePermission.departmentName = resource.owner.departmentName

  // if the dataset is created by a contrib initially allow them to also destroy it
  contribWritePermission.operations = ['delete']

  resource.permissions = [contribWritePermission, { ...contribWritePermission, classes: ['list', 'read', 'readAdvanced'], operations: [] }]
}

module.exports.router = (resourceType, resourceName, onPublicCallback) => {
  const router = express.Router()

  router.get('', exports.middleware('getPermissions', 'admin'), async (req, res, next) => {
    res.status(200).send(req[resourceName].permissions || [])
  })

  router.put('', exports.middleware('setPermissions', 'admin'), async (req, res, next) => {
    validate(req.body)
    req.body = req.body || []
    let valid = true
    for (const permission of req.body) {
      if ((!permission.type && permission.id) || (permission.type && !(permission.id || permission.email))) valid = false
    }
    if (!valid) return res.status(400).type('text/plain').send('Error in permissions format')
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
