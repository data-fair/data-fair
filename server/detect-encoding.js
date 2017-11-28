const fs = require('fs')
const path = require('path')
const config = require('config')
const detectCharacterEncoding = require('detect-character-encoding')
const util = require('util')

const stat = util.promisify(fs.stat)
const open = util.promisify(fs.open)
const read = util.promisify(fs.read)

module.exports = async function(dataset) {
  const fileName = path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.file.name.split('.').pop())
  const st = await stat(fileName)
  const fd = await open(fileName, 'r')
  const size = Math.min(st.size, 128 * 1024)
  const buffer = Buffer.alloc(size)
  await read(fd, buffer, 0, size, 0)
  fs.close(fd)
  return detectCharacterEncoding(buffer).encoding
}
