const { getOwnerRole } = require('../../misc/utils/permissions')

exports.prepareInitFrom = (dataset, user) => {
  dataset.initFrom.role = getOwnerRole(dataset.owner, user)
}
