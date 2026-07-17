import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Remove the obsolete tileserver-koumoul remote service',
  async exec (db, debug) {
    // the tileserver is now a standard member of the stack exposed at /tileserver,
    // this instance-level service seeded from config is obsolete (a redirect handles legacy URLs)
    const res = await db.collection('remote-services').deleteOne({ id: 'tileserver-koumoul', owner: { $exists: false } })
    debug(`deleted ${res.deletedCount} tileserver-koumoul remote service`)
  }
}

export default upgradeScript
