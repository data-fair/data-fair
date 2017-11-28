const fs = require('fs')
const split = require('split')
const util = require('util')

const countLines = (filePath, delimiter, callback) => {
  let readError
  let lineCount = 0
  fs.createReadStream(filePath)
    .pipe(split(delimiter))
    .on('data', (line) => {
      lineCount++
    })
    .on('end', () => {
      if (readError) {
        return
      }
      callback(null, lineCount - 1)
    })
    .on('error', (error) => {
      readError = true
      callback(error)
    })
}

module.exports = util.promisify(countLines)
