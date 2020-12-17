const fs = require('fs-extra')
const datasetUtils = require('../../../server/utils/dataset')

  exports.description = 'Update finalizedAt metadata of some datasets so that tile caches are invalidated'

  exports.exec = async (db, debug) => {
    const cursor = db.collection('datasets').find({ bbox: { $ne: null } })
    const finalizedAt = new Date().toISOString()
    for await (const dataset of cursor) {
      if (dataset.originalFile) {
        const mbtilesPath = datasetUtils.extFileName(dataset, 'mbtiles')
        if (await fs.exists(mbtilesPath)) continue
      }

      debug(`change finalizedAt (${dataset.finalizedAt} -> ${finalizedAt}) for dataset ${dataset.id}`)
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { finalizedAt } })
    }
  }
