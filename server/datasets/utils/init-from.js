const { getOwnerRole } = require('../../misc/utils/permissions')

exports.prepareInitFrom = (dataset, user) => {
  dataset.initFrom.role = getOwnerRole(dataset.owner, user)
  if (dataset.initFrom.role && dataset.owner.department) {
    dataset.initFrom.department = user.activeAccount.department ?? '-'
  }
}
