import fs from 'fs-extra'
import { pipeline } from 'node:stream/promises'
import { iterCSV } from '../../misc/utils/xlsx.ts'

/**
 * @param {{source: string, destination: string}} options
 */
export default async ({ source, destination }) => {
  await pipeline(iterCSV(source), fs.createWriteStream(destination))
}
