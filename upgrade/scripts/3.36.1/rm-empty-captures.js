const fs = require('fs-extra')
const path = require('path')
const config = require('config')

exports.description = 'Remove empty capture files'

exports.exec = async (db, debug) => {
  const dir = path.resolve(config.dataDir, 'captures')
  const files = await fs.readdir(dir)
  for (const file of files) {
    const stats = await fs.stat(path.join(dir, file))
    if (stats.size < 1000) {
      debug('rm empty capture', file)
      await fs.rm(path.join(dir, file))
    }
  }
}
