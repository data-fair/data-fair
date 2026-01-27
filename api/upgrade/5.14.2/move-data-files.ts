import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import config from '#config'
import fs from 'fs-extra'
import path from 'path'

export const dataDir = path.resolve(config.dataDir)

const upgradeScript: UpgradeScript = {
  description: 'Move data files from the root of datasets directories to a sub folder',
  async exec (db, debug) {
    for (const ownerType of ['user', 'organization']) {
      if (!await fs.pathExists(path.join(dataDir, ownerType))) {
        console.log('no directory', ownerType)
        continue
      }
      for (const ownerId of await fs.readdir(path.join(dataDir, ownerType))) {
        for (const subdir of await fs.readdir(path.join(dataDir, ownerType, ownerId))) {
          if (subdir !== 'datasets' && subdir !== 'datasets-drafts') continue
          debug(`work on ${ownerType} ${ownerId} directory ${subdir}`)
          for (const dir of await fs.readdir(path.join(dataDir, ownerType, ownerId, subdir), { withFileTypes: true })) {
            if (!dir.isDirectory()) continue
            const datasetId = dir.name
            debug(`work on dataset ${datasetId}`)
            const datasetDir = path.join(dataDir, ownerType, ownerId, subdir, datasetId)
            const datasetChildren = await fs.readdir(datasetDir, { withFileTypes: true })
            if (datasetChildren.some(c => c.isDirectory() && c.name === 'data-files')) {
              debug('data-files directory already exists, ignore this dataset')
              continue
            }
            const files = datasetChildren.filter(c => c.isFile()).map(c => c.name)
            if (!files.length) {
              debug('no data files detected, ignore this dataset')
              continue
            }
            await fs.ensureDir(path.join(datasetDir, 'data-files'))
            for (const file of files) {
              debug('move file in data-files subdirectory', file)
              await fs.rename(path.join(datasetDir, file), path.join(datasetDir, 'data-files', file))
            }
          }
        }
      }
    }
  }
}

export default upgradeScript
