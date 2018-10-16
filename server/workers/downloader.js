const datasetFileSample = require('../utils/dataset-file-sample')
const chardet = require('chardet')
const journals = require('../utils/journals')
const baseTypes = new Set(['text/csv', 'application/geo+json'])
const config = require('config')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const writeFile = util.promisify(fs.writeFile)
const mime = require('mime-types')
const fallbackMimeTypes = {
  dbf: 'application/dbase',
  dif: 'text/plain',
  fods: 'application/vnd.oasis.opendocument.spreadsheet'
}

exports.type = 'dataset'
exports.eventsPrefix = 'download'
exports.filter = { status: 'remote' }

exports.process = async function(app, dataset) {
  await journals.log(app, dataset, { type: 'download-start' }, 'dataset')
  const uploadDir = path.join(config.dataDir, dataset.owner.type, dataset.owner.id)
  fs.ensureDirSync(uploadDir)
  const file = {
    name: dataset.id + '.' + dataset.remoteFile.url.split('.').pop()
  }
  file.mimetype = mime.lookup(file.name) || fallbackMimeTypes[file.name.split('.').pop()] || file.name.split('.').pop()
  await axios({
    method: 'get',
    url: dataset.remoteFile.url,
    responseType: 'arraybuffer'
  }).then(function(response) {
    file.size = response.data.length
    return writeFile(path.join(uploadDir, file.name), response.data)
  })

  dataset.originalFile = file
  if (!baseTypes.has(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    dataset.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    dataset.status = 'loaded'
    dataset.file = dataset.originalFile
    const fileSample = await datasetFileSample(dataset)
    dataset.file.encoding = chardet.detect(fileSample)
  }
  await journals.log(app, dataset, { type: 'download-end' }, 'dataset')
  await app.get('db').collection('datasets').replaceOne({
    id: dataset.id
  }, dataset)
  // const storageRemaining = await datasetUtils.storageRemaining(req.app.get('db'), owner, req)
  // if (storageRemaining !== -1) res.set(config.headers.storedBytesRemaining, storageRemaining)
}
