exports.process = async function (app, dataset) {
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { basicTypes } = require('./converter')
  const datasetFileSample = require('../datasets/utils/file-sample')
  const chardet = require('chardet')
  const { filePath } = require('./utils/files')

  const debug = require('debug')(`worker:file-loader:${dataset.id}`)
  // const db = app.get('db')

  exports.eventsPrefix = 'load'

  const patch = { loadedFile: null }

  const file = dataset.loadedFile

  patch.originalFile = file

  if (file && !basicTypes.includes(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
    if (file) {
      patch.file = patch.originalFile
      const newFilePath = filePath({ ...dataset, ...patch })
      const fileSample = await datasetFileSample({ ...dataset, ...patch })
      debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${newFilePath}`)
      patch.file.encoding = chardet.detect(fileSample)
      debug(`Detected encoding ${patch.file.encoding} for file ${newFilePath}`)
    }
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
