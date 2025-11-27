import config from '#config'
import mongo from '#mongo'
import { Router, type Response, type NextFunction, type RequestHandler } from 'express'
import { validate, resolvedSchema as permissionsSchema } from '#types/permissions/index.js'
import * as apiDocsUtil from './api-docs.ts'
import * as visibilityUtils from './visibility.js'
import { type AccountKeys, getAccountRole, reqSession, type SessionState } from '@data-fair/lib-express'
import { type RequestWithResource, type ResourceType, type Permission, type Resource, type BypassPermissions } from '#types'
import catalogsPublicationQueue from './catalogs-publication-queue.ts'

const resourceTypesLabels = {
  datasets: 'Le jeu de données',
  applications: 'L\'application',
  catalogs: 'Le connecteur'
}

export const middleware = function (operationId: string, operationClass: string, trackingCategory?: string, acceptMissing?: boolean) {
  return function (req: RequestWithResource, res: Response, next: NextFunction) {
    const sessionState = reqSession(req)

    if ((acceptMissing && !req.resource)) {
      next()
      return
    }
    if (can(req.resourceType, req.resource, operationId, sessionState, req.bypassPermissions)) {
      // nothing to do, user can proceed
    } else {
      res.status(403).type('text/plain')
      const denomination = resourceTypesLabels[req.resourceType] || 'La ressource'
      if (operationId === 'readDescription') {
        if (!sessionState.user) {
          res.send(`${denomination} n'est pas accessible publiquement. Veuillez vous connecter.`)
          return
        }
        for (const org of sessionState.user.organizations || []) {
          let name = org.name || org.id
          if (org.department) name += ' / ' + (org.departmentName || org.department)
          const altSessionState: SessionState = { ...sessionState, account: { type: 'organization', ...org }, accountRole: org.role }
          if (can(req.resourceType, req.resource, operationId, altSessionState, req.bypassPermissions)) {
            res.send(`${denomination} ${req.resource.title} est accessible depuis l'organisation ${name} dont vous êtes membre mais vous ne l'avez pas sélectionné comme compte actif. Changez de compte pour visualiser les informations.`)
            return
          }
        }
        res.send(`${denomination} est accessible uniquement aux utilisateurs autorisés par le propriétaire. Vous n'avez pas les permissions nécessaires pour visualiser les informations.`)
        return
      }
      res.send(`Permission manquante pour l'opération "${operationId}" ou la catégorie "${operationClass}".`)
      return
    }

    // this is stored here to be used by cache headers utils to manage public cache
    req.publicOperation = can(req.resourceType, req.resource, operationId, { lang: 'fr' })

    // these headers can be used to apply other permission/quota/metrics on the gateway
    if (req.resource) res.setHeader('x-resource', JSON.stringify({ type: req.resourceType, id: req.resource.id, title: encodeURIComponent(req.resource.title ?? '') }))
    if (req.resource && req.resource.owner) {
      const ownerHeader: AccountKeys = { type: req.resource.owner.type, id: req.resource.owner.id }
      if (req.resource.owner.department) ownerHeader.department = req.resource.owner.department
      res.setHeader('x-owner', JSON.stringify(ownerHeader))
    }
    const operation = { class: operationClass, id: operationId, track: trackingCategory };
    (req as any).operation = operation
    res.setHeader('x-operation', JSON.stringify(operation))
    next()
  }
}

export const canDoForOwnerMiddleware = function (operationClass: string, ignoreDepartment = false) {
  return function (req: RequestWithResource, res: Response, next: NextFunction) {
    const owner: AccountKeys = ignoreDepartment ? { ...req.resource.owner, department: undefined } : req.resource.owner
    if (!canDoForOwner(owner, req.resourceType, operationClass, reqSession(req))) {
      return res.status(403).type('text/plain').send('Permission manquante pour l\'opération.')
    }
    next()
  }
}

export const getOwnerRole = (owner: AccountKeys, sessionState: SessionState | undefined, ignoreDepartment = false) => {
  if (!sessionState?.user || !sessionState?.account || (sessionState as SessionState & { isApplicationKey?: boolean }).isApplicationKey) return null
  return getAccountRole(sessionState, owner, { acceptDepAsRoot: ignoreDepartment })
}

const getOwnerClasses = (owner: AccountKeys, sessionState: SessionState, resourceType: ResourceType) => {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const ownerRole = getOwnerRole(owner, sessionState)
  if (!ownerRole) return null
  // classes of operations the user can do based on him being member of the resource's owner
  if (ownerRole === config.adminRole || (sessionState.user?.adminMode)) {
    return Object.keys(operationsClasses)
      .concat(apiDocsUtil.contribOperationsClasses[resourceType] || [])
      .concat(apiDocsUtil.adminOperationsClasses[resourceType] || [])
  }
  if (ownerRole === config.contribRole) {
    return apiDocsUtil.contribOperationsClasses[resourceType] || []
  }
  return null
}

const matchPermission = (owner: AccountKeys, permission: Permission, sessionState: SessionState) => {
  if (!permission.type && !permission.id) return true // public
  if (!sessionState.user || !sessionState.account || !sessionState.accountRole || (sessionState as SessionState & { isApplicationKey?: boolean }).isApplicationKey) return false
  if (sessionState.user.adminMode) return true

  // individual user permissions are applied no matter the current active account
  if (permission.type === 'user') {
    if (permission.id === '*') return true
    if (permission.email && permission.email === sessionState.user.email) return true
    if (permission.id && permission.id === sessionState.user.id) return true
    return false
  }

  // if a user is switched on an organization, permissions for his role in this organization apply
  // permissions for his other organizations do not apply
  if (permission.type === 'organization' && sessionState.account.type === 'organization' && permission.id === sessionState.account.id) {
    // department does not match
    if (sessionState.account.department && permission.department && permission.department !== '*' && permission.department !== sessionState.account.department) return false
    if (!permission.roles || !permission.roles.length) return true
    if (sessionState.accountRole === config.adminRole) return true
    if (permission.roles.includes(sessionState.accountRole)) return true
  }
  return false
}

// resource can be an application, a dataset or a remote service
export const can = function (resourceType: ResourceType, resource: Resource, operationId: string, sessionState: SessionState, bypassPermissions?: BypassPermissions) {
  if (sessionState.user?.adminMode) return true
  const userPermissions = list(resourceType, resource, sessionState, bypassPermissions)
  return !!userPermissions.includes(operationId)
}

// list operations a user can do with a resource
export const list = function (resourceType: ResourceType, resource: Resource, sessionState: SessionState, bypassPermissions?: BypassPermissions) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const operations = new Set<string>([])

  // apply specific permissions from application key
  if (bypassPermissions) {
    for (const cl of bypassPermissions.classes || []) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
    for (const operation of bypassPermissions.operations || []) operations.add(operation)
    return [...operations]
  }

  // apply implicit permissions based on user being a member of the owner of this resource
  const ownerClasses = getOwnerClasses(resource.owner, sessionState, resourceType)
  if (ownerClasses) {
    for (const cl of ownerClasses) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
  }

  // apply explicit permissions set on the resource for this user
  const permissions = (resource.permissions || []).filter(p => matchPermission(resource.owner, p, sessionState))
  for (const permission of permissions) {
    for (const operation of permission.operations || []) operations.add(operation)
    for (const cl of permission.classes || []) {
      for (const operation of operationsClasses[cl] || []) operations.add(operation)
    }
  }
  return [...operations]
}

const permissionOperations = (resourceType: ResourceType, permission: Permission) => {
  const operations = new Set<string>()
  for (const op of permission.operations ?? []) {
    operations.add(op)
  }
  for (const opClass of permission.classes ?? []) {
    for (const op of apiDocsUtil.operationsClasses[resourceType][opClass]) {
      operations.add(op)
    }
  }
  return operations
}

// resource is public if there are public permissions for all operations of the classes 'read' and 'use'
// list is not here as someone can set a resource publicly usable but not appearing in lists
export const isPublic = function (resourceType: ResourceType, resource: Resource) {
  const operationsClasses = apiDocsUtil.operationsClasses[resourceType]
  const publicOperations = new Set<string>()
  if (operationsClasses.read) {
    for (const operationClass of operationsClasses.read) {
      publicOperations.add(operationClass)
    }
  }
  if (operationsClasses.use) {
    for (const operationClass of operationsClasses.use) {
      publicOperations.add(operationClass)
    }
  }
  const publicPermissions = (resource.permissions ?? []).filter(p => !p.type && !p.id)
  for (const op of publicOperations) {
    const publicPermission = publicPermissions.some(p => permissionOperations(resourceType, p).has(op))
    if (!publicPermission) return false
  }
  return true
}

// Manage filters for datasets, applications and remote services
// this filter ensures that nobody can list something they are not permitted to list
export const filter = function (sessionState: SessionState, resourceType: ResourceType) {
  return [visibilityUtils.publicFilter].concat(filterCan(sessionState, resourceType, 'list'))
}

export const filterCan = function (sessionState: SessionState, resourceType: ResourceType, operation = 'list'): any[] {
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

  if (sessionState.user) {
    // user is in super admin mode, show all
    if (sessionState.user.adminMode) {
      or.push({ 'owner.type': { $exists: true } })
    } else {
      // public permissions apply to anyone
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: null, id: null } } })
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: '*' } } })
      // individual user permissions are applied no matter the current active account
      // user is owner
      or.push({ 'owner.type': 'user', 'owner.id': sessionState.user.id })
      // user has specific permission to read, given by id or by email
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: sessionState.user.id } } })
      if (sessionState.user.email) or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', email: sessionState.user.email } } })

      if (sessionState.organization) {
        const listRoles = ['admin']
        if (resourceType && apiDocsUtil.contribOperationsClasses[resourceType] && apiDocsUtil.contribOperationsClasses[resourceType].includes('list')) {
          listRoles.push('contrib')
        }
        // user is privileged admin or owner of organization with or without department
        if (listRoles.includes(sessionState.organization.role)) {
          if (sessionState.organization.department && !ignoreDepartment) or.push({ 'owner.type': 'organization', 'owner.id': sessionState.organization.id, 'owner.department': sessionState.organization.department })
          else or.push({ 'owner.type': 'organization', 'owner.id': sessionState.organization.id })
        }

        // user's orga has specific permission to read
        const filters: any[] = [
          // check that the permission applies to the current org of the user
          { type: 'organization', id: sessionState.organization.id },
          // check that the permission applies to the current operation (through its class or operation id)
          { $or: operationFilter },
          // either the permission is not specific to a role or it matches the user's role in the organization
          { $or: [{ roles: sessionState.organization.role }, { roles: { $size: 0 } }, { roles: { $exists: false } }] }
        ]
        if (sessionState.organization.department) {
          // either the permission is not specific to a department or it matches the user's department
          filters.push({ $or: [{ department: sessionState.organization.department }, { department: '*' }, { department: { $exists: false } }] })
        }
        or.push({ permissions: { $elemMatch: { $and: filters } } })
      }
    }
  }
  return or
}

// Only operationId level : it is used only for creation of resources and
// setting screen only set creation permissions at operationId level
export const canDoForOwner = function (owner: AccountKeys, resourceType: ResourceType, operationClass: string, sessionState: SessionState) {
  if (sessionState.user?.adminMode) return true
  const ownerClasses = getOwnerClasses(owner, sessionState, resourceType)
  return ownerClasses && ownerClasses.includes(operationClass)
}

export const initResourcePermissions = async (resource: Resource, extraPermissions: Permission[] = []) => {
  // initially give owner contribs permissions to write
  if (resource.owner.type === 'user') {
    resource.permissions = extraPermissions
    return
  }
  const contribWritePermission: Permission = {
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

  resource.permissions = [contribWritePermission, { ...contribWritePermission, classes: ['list', 'read', 'readAdvanced'], operations: [] }, ...extraPermissions]
}

export const router = (resourceType: ResourceType, resourceName: string, onPublicCallback: ((req: RequestWithResource, resource: Resource) => void)) => {
  const router = Router()

  router.get('', middleware('getPermissions', 'admin') as RequestHandler, (async (req: RequestWithResource, res, next) => {
    res.status(200).send(req.resource.permissions || [])
  }) as RequestHandler)

  router.put('', middleware('setPermissions', 'admin') as RequestHandler, (async (req, res, next) => {
    validate(req.body)
    const permissions = (req.body || []) as Permission[]
    let valid = true
    for (const permission of permissions) {
      if ((!permission.type && permission.id) || (permission.type && !(permission.id || permission.email))) valid = false
    }
    if (!valid) {
      res.status(400).type('text/plain').send('Error in permissions format')
      return
    }
    const resources = mongo.db.collection(resourceType)
    try {
      const resource = await req.resource
      const wasPublic = isPublic(resourceType, resource)
      const willBePublic = isPublic(resourceType, { ...resource, permissions })

      // re-publish to catalogs if public/private was switched
      if (['datasets', 'applications'].includes(resourceType)) {
        if (wasPublic !== willBePublic) {
          await resources.updateOne(
            { id: resource.id, 'publications.status': 'published' },
            { $set: { 'publications.$.status': 'waiting' } }
          )

          if (resourceType === 'datasets') {
            // Re-publish publications (with catalogs service)
            catalogsPublicationQueue.updatePublication(resource.id)
          }
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
  }) as RequestHandler)

  return router
}

export const apiDoc = {
  get: {
    summary: 'Liste des permissions',
    description: 'Récupérer la liste des permissions.',
    operationId: 'getPermissions',
    'x-permissionClass': 'admin',
    tags: ['Permissions'],
    responses: {
      200: {
        description: 'Liste des permissions.',
        content: {
          'application/json': {
            schema: permissionsSchema
          }
        }
      }
    }
  },
  put: {
    summary: 'Définir les permissions',
    description: 'Définir la liste des permissions.',
    operationId: 'setPermissions',
    'x-permissionClass': 'admin',
    tags: ['Permissions'],
    requestBody: {
      description: 'Liste des permissions.',
      required: true,
      content: {
        'application/json': {
          schema: permissionsSchema
        }
      }
    },
    responses: {
      200: {
        description: 'Liste des permissions.',
        content: {
          'application/json': {
            schema: permissionsSchema
          }
        }
      }
    }
  }
}
