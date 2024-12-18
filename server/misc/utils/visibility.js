// Manage mongodb filters to manage resources visibility
// do not mix with permissions filters that restrict to what a user can list regardless of the permission type
// private = no permissions defined
// public = a list permission defined for anonymous
// protected = a list permission defined but none for anonymous

const operationFilter = [{ operations: 'list' }, { classes: 'list' }]

 export const publicFilter = {
  permissions: {
    $elemMatch: { $or: operationFilter, type: null, id: null }
  }
}

 export const privateFilter = {
  permissions: {
    $not: { $elemMatch: { $or: operationFilter } }
  }
}

 export const protectedFilter = {
  permissions: {
    $elemMatch: { $or: operationFilter },
    $not: { $elemMatch: { $or: operationFilter, type: null, id: null } }
  }
}

 export const visibility = (resource) => {
  const permissions = resource.permissions || []
  if (permissions.find(p => ((p.operations && p.operations.includes('list')) || (p.classes && p.classes.includes('list'))) && !p.type && !p.id)) {
    return 'public'
  }
  if (permissions.length === 0) {
    return 'private'
  }
  return 'protected'
}

 export const filters = (reqQuery) => {
  const showPublic = reqQuery.public === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('public'))
  const showPrivate = reqQuery.private === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('private'))
  const showProtected = reqQuery.protected === 'true' || (reqQuery.visibility && reqQuery.visibility.includes('protected'))

  // default is no filter
  if (!showPublic && !showPrivate && !showProtected) return null

  const filters = []
  if (showPublic) filters.push( export const publicFilter)
  if (showPrivate) filters.push( export const privateFilter)
  if (showProtected) {
    filters.push( export const protectedFilter)
  }

  return filters
}
