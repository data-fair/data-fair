import { type MetadonneesSpecifiques } from '#types/settings/index.js'
import { type AccountKeys } from '@data-fair/lib-express'
import equal from 'fast-deep-equal'
import mongo from '#mongo'

export const updateCustomMetata = async (owner: AccountKeys, oldCustomMetadata: MetadonneesSpecifiques, newCustomMetadata: MetadonneesSpecifiques) => {
  if (equal(oldCustomMetadata, newCustomMetadata)) return
  for (const oldMeta of oldCustomMetadata) {
    if (!newCustomMetadata.some(nc => nc.key === oldMeta.key)) {
      await mongo.datasets.updateMany(
        { 'owner.type': owner.type, 'owner.id': owner.id, [`customMetadata.${oldMeta.key}`]: { $exists: true } },
        { $unset: { [`customMetadata.${oldMeta}`]: 1 } })
      await mongo.datasets.updateMany(
        { 'owner.type': owner.type, 'owner.id': owner.id, [`draft.customMetadata.${oldMeta.key}`]: { $exists: true } },
        { $unset: { [`draft.customMetadata.${oldMeta}`]: 1 } })
    }
  }
}
