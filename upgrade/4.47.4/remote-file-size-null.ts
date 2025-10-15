import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Remove the null values in remoteFile.size that do not conform to the schema',
  async exec (db, debug) {
    const res = await db.collection('datasets').updateMany(
      { 'remoteFile.size': { $type: 10 } }, // $type=10 means equal null
      { $unset: { 'remoteFile.size': 1 } })
    debug('result', res)
  }
}

export default upgradeScript
