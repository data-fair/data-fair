// Manage mongodb filters to manage resources visibility
// do not mix with permissions filters that restrict to what a user can list regardless of the permission type
// private = no permissions defined
// public = a list permission defined for anonymous
// protected = a list permission defined but none for anonymous

const operationFilter = [{ operations: 'list' }, { classes: 'list' }]

exports.publicFilter = { permissions: {
  $elemMatch: { $or: operationFilter, type: null, id: null }
} }

exports.privateFilter = { permissions: {
  $not: { $elemMatch: { $or: operationFilter } }
} }

exports.protectedFilter = { permissions: {
  $elemMatch: { $or: operationFilter },
  $not: { $elemMatch: { $or: operationFilter, type: null, id: null } }
} }

exports.visibility = (resource) => {
  resource.permissions = resource.permissions || []
  if (resource.permissions.find(p => ((p.operations && p.operations.includes('list')) || (p.classes && p.classes.includes('list'))) && !p.type && !p.id)) {
    return 'public'
  }
  if (resource.permissions.length === 0) {
    return 'private'
  }
  return 'protected'
}

exports.filters = (reqQuery) => {
  const showPublic = reqQuery.public === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('public'))
  const showPrivate = reqQuery.private === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('private'))
  const showProtected = reqQuery.protected === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('protected'))

  // default is no filter
  if (!showPublic && !showPrivate && !showProtected) return null

  const filters = []
  if (showPublic) filters.push(exports.publicFilter)
  if (showPrivate) filters.push(exports.privateFilter)
  if (showProtected) {
    filters.push(exports.protectedFilter)
  }

  return filters
}
