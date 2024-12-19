
import { getOwnerRole } from '../../misc/utils/permissions.js'

 export const prepareInitFrom = (dataset, user) => {
  dataset.initFrom.role = getOwnerRole(dataset.owner, user)
  if (dataset.initFrom.role && dataset.owner.department) {
    dataset.initFrom.department = user.activeAccount.department ?? '-'
  }
}
