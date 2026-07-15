import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Remove stored user names from authoring fields and trim journals/applications-keys owner copies',
  async exec (db, debug) {
    // authoring events keep only the opaque user id (also inside dataset drafts)
    const authoringUnset = {
      'createdBy.name': '',
      'updatedBy.name': '',
      'dataUpdatedBy.name': '',
      'draft.createdBy.name': '',
      'draft.updatedBy.name': '',
      'draft.dataUpdatedBy.name': ''
    }
    for (const c of ['datasets', 'applications', 'catalogs']) {
      const res = await db.collection(c).updateMany(
        { $or: Object.keys(authoringUnset).map(k => ({ [k]: { $exists: true } })) },
        { $unset: authoringUnset }
      )
      debug(`removed authoring user names from ${res.modifiedCount} ${c}`)
    }

    // remote-services.updatedBy was written but never read nor declared in the schema
    const resRemoteServices = await db.collection('remote-services').updateMany(
      { updatedBy: { $exists: true } },
      { $unset: { updatedBy: '' } }
    )
    debug(`removed updatedBy from ${resRemoteServices.modifiedCount} remote-services`)

    // journals and application keys only need owner type/id(/department) for filtering
    for (const c of ['journals', 'applications-keys']) {
      const res = await db.collection(c).updateMany(
        {
          $or: [
            { 'owner.name': { $exists: true } },
            { 'owner.role': { $exists: true } },
            { 'owner.departmentName': { $exists: true } }
          ]
        },
        { $unset: { 'owner.name': '', 'owner.role': '', 'owner.departmentName': '' } }
      )
      debug(`trimmed owner on ${res.modifiedCount} ${c}`)
    }
  }
}

export default upgradeScript
