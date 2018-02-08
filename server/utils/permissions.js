const config = require('config')
const express = require('express')
const permissionsSchema = require('../../contract/permissions.json')
const ajv = require('ajv')()
const validate = ajv.compile(permissionsSchema)

// resource can be an application, a dataset of an remote service
exports.can = function(resource, operationId, user) {
  const operationPermissions = (resource.permissions || []).filter(p => !p.operations.length || p.operations.indexOf(operationId) >= 0)
  // check if the operation is public
  if (operationPermissions.find(p => !p.type && !p.id)) return true
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
    if (operationPermissions.find(p => p.type === 'user' && p.id === user.id)) return true
    if (operationPermissions.find(p => {
      const orgaUser = p.type === 'organization' && user.organizations.find(o => o.id === p.id)
      return orgaUser && ((!p.roles || !p.roles.length) || p.roles.indexOf(orgaUser.role) >= 0)
    })) return true
    return false
  }
}

// Manage filters for datasets, applications and remote services
exports.filter = function(user) {
  const operationFilter = [{operations: 'readDescription'}, {operations: {$size: 0}}]

  // this filter is for public resources
  const or = [{
    permissions: {
      $elemMatch: {$or: operationFilter, type: null, id: null}
    }
  }]

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
exports.isOwner = function(owner, user) {
  if (!user) return false
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    return userOrga && userOrga.role === config.adminRole
  }
  return false
}

//
exports.canDoForOwner = async function(owner, operationId, user, db) {
  if (!user) return false
  if (owner.type === 'user' && owner.id === user.id) return true
  if (owner.type === 'organization') {
    const userOrga = user.organizations.find(o => o.id === owner.id)
    if (userOrga) {
      if (userOrga.role === config.adminRole) return true
      const settings = await db.collection('settings').findOne(owner)
      const operationsPermissions = settings.operationsPermissions && settings.operationsPermissions[operationId]
      if (operationsPermissions) return operationsPermissions.indexOf(userOrga.role) >= 0
    }
  }
  return false
}

module.exports.router = (collectionName, resourceName) => {
  const router = express.Router()

  router.get('', async (req, res, next) => {
    if (!exports.isOwner(req[resourceName].owner, req.user)) return res.sendStatus(403)
    res.status(200).send(req[resourceName].permissions || [])
  })

  // update settings
  router.put('', async (req, res, next) => {
    if (!exports.isOwner(req[resourceName].owner, req.user)) return res.sendStatus(403)
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
