import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import config from '#config'
import { stampSchemaLanguage } from '../../src/datasets/utils/data-schema.ts'

const upgradeScript: UpgradeScript = {
  description: 'Stamp language meta on schema columns where the language-analyzed text capability is active',
  async exec (db, debug) {
    const platformLanguage = config.elasticsearch.defaultLanguage
    let count = 0
    const cursor = db.collection('datasets').find({})
    for await (const dataset of cursor) {
      const changedMain = stampSchemaLanguage(dataset.schema, platformLanguage)
      const changedDraft = stampSchemaLanguage(dataset.draft?.schema, platformLanguage)
      if (changedMain || changedDraft) {
        const $set: any = {}
        if (changedMain) $set.schema = dataset.schema
        if (changedDraft) $set['draft.schema'] = dataset.draft.schema
        await db.collection('datasets').updateOne({ _id: dataset._id }, { $set })
        count++
      }
    }
    debug(`stamped language on ${count} datasets`)
  }
}
export default upgradeScript
