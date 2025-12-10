import { type MetadonneesSpecifiques } from '#types/settings/index.js'
import { type AccountKeys } from '@data-fair/lib-express'
import equal from 'fast-deep-equal'
import mongo from '#mongo'
import clone from '@data-fair/lib-utils/clone.js'

export const updateCustomMetata = async (owner: AccountKeys, oldCustomMetadata: MetadonneesSpecifiques, newCustomMetadata: MetadonneesSpecifiques) => {
  if (equal(oldCustomMetadata, newCustomMetadata)) return
  for await (const dataset of mongo.datasets.find({ 'owner.type': owner.type, 'owner.id': owner.id }, { projection: { id: 1, draft: 1, customMetadata: 1 } })) {
    const datasetCustomMedata = clone(newCustomMetadata) as { key: string, title: string, value?: string }[]
    for (const customMetadata of datasetCustomMedata) {
      const existingCustomMetadata = dataset.customMetadata?.find(cm => cm.key === customMetadata.key)
      if (existingCustomMetadata?.value) customMetadata.value = existingCustomMetadata.value
    }
    await mongo.datasets.updateOne({ id: dataset.id }, { $set: { customMetadata: datasetCustomMedata } })
    if (dataset.draft) {
      const draftCustomMedata = clone(newCustomMetadata) as { key: string, title: string, value?: string }[]
      for (const customMetadata of draftCustomMedata) {
        const existingCustomMetadata = dataset.draft.customMetadata?.find(cm => cm.key === customMetadata.key)
        if (existingCustomMetadata?.value) customMetadata.value = existingCustomMetadata.value
      }
      await mongo.datasets.updateOne({ id: dataset.id }, { $set: { 'draft.customMetadata': draftCustomMedata } })
    }
  }
}
