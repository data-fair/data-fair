const fs = require('fs-extra')
const datasetUtils = require('../../../server/utils/dataset')

exports.description = 'Delete all generated mbtiles files, this is deprecated'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({ bbox: { $ne: null } })
  for await (const dataset of cursor) {
    if (dataset.originalFile) {
      const mbtilesPath = datasetUtils.extFileName(dataset, 'mbtiles')
      if (await fs.exists(mbtilesPath)) await fs.remove(mbtilesPath)
    }
  }
}
