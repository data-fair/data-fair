// check and optimize the state of the indexes managed by data-fair
// check for orphans, merge segments, etc

// Run this script FORCE_MERGE=1 for a full merge of all indexes
// DO NOT RUN do this at peak activity, force merge is expensive
// https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html#:~:text=Aim%20for%20shard%20sizes%20between,and%20may%20tax%20node%20resources.

import config from '#config'
import mongo from '#mongo'
import * as esUtils from '../src/datasets/es/index.ts'

// this script if often run outside of peak activity
// we do not want it to last forever if ever it detects that it has a lot of work to do
const maxDuration = 60 * 60 * 1000
const start = new Date().getTime()

const forceMerge = process.env.FORCE_MERGE === '1'

async function main () {
  await mongo.connect()
  const db = mongo.db
  const es = await esUtils.init()
  const indexes = (await es.cat.indices({ index: `${config.indicesPrefix}-*`, format: 'json' }))
  for (const index of indexes) {
    const indexName = index.index
    if (!indexName) {
      console.log('index has no name', index)
      continue
    }
    if (new Date().getTime() - start > maxDuration) {
      console.error('Max duration exceeded, stop')
      break
    }
    const getAliasRes = await es.indices.getAlias({ index: indexName })
    const aliases = getAliasRes[indexName] && getAliasRes[indexName].aliases && Object.keys(getAliasRes[indexName].aliases)
    const alias = aliases.find((/** @type {any} */ alias) => indexName.startsWith(alias))
    if (!alias) {
      console.warn(`index ${indexName} does not have matching alias`, index['store.size'])
      continue
    }

    const dataset = await db.collection('datasets').findOne({ id: alias.replace(`${config.indicesPrefix}-`, '') })
    if (!dataset) {
      console.warn(`alias ${alias} does not have matching dataset in database`, index['store.size'])
      continue
    }
    const segments = await es.cat.segments({ index: indexName, format: 'json' })

    // force merge is recommended on read-only indexes only, so rest datasets are excluded
    if (segments.length > 2 && !dataset.isRest) {
      if (forceMerge) {
        await es.indices.forcemerge({ index: indexName, max_num_segments: 1 })
        console.log(`merged segments for index ${indexName}, number of segments=${segments.length}`)
      } else {
        console.log(`should merge segments for index ${indexName} ? number of segments=${segments.length}`)
      }
    }
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
