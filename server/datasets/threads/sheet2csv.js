const fs = require('fs-extra')
const { pipeline } = require('node:stream').promises
const { iterCSV } = require('../../misc/utils/xlsx')

/**
 * @param {{source: string, destination: string}} options
 */
module.exports = async ({ source, destination }) => {
  await pipeline(iterCSV(source), fs.createWriteStream(destination))
}
