export default {
  isInDepartmentPermission (p, resource) {
    return (!p.department || (!resource.owner.department && p.department === '-') || p.department === resource.owner.department)
  },
  isContribWriteAllPermission (p, resource) {
    return p.type === 'organization' && resource.owner.type === 'organization' &&
        p.id === resource.owner.id && this.isInDepartmentPermission(p, resource) &&
        p.roles && p.roles.length === 1 && p.roles[0] === 'contrib' &&
        p.classes && p.classes.includes('write') && p.operations && p.operations.includes('delete')
  }
}
