const fs = require('fs')
const util = require('util')

const stat = util.promisify(fs.stat)
const open = util.promisify(fs.open)
const read = util.promisify(fs.read)

module.exports = async function (p) {
  const st = await stat(p)
  const fd = await open(p, 'r')
  const size = Math.min(st.size, 1024 * 1024)
  const buffer = Buffer.alloc(size)
  await read(fd, buffer, 0, size, 0)
  fs.close(fd)
  return buffer
}
