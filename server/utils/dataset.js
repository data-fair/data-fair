const path = require('path')
const config = require('config')

module.exports.fileName = (dataset) => path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.file.name.split('.').pop())
