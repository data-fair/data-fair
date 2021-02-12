// check and optimize the state of the indexes managed by data-fair
// check for orphans, merge segments, etc
// DO NOT RUN this at peak activity, force merge is expensive
// https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html#:~:text=Aim%20for%20shard%20sizes%20between,and%20may%20tax%20node%20resources.

const config = require('config')

// this script if often run outside of peak activity
// we do not want it to last forever if ever it detects that it has a lot of work to do
const maxDuration = 60 * 60 * 1000
const start = new Date().getTime()

async function main() {
  const { db } = await require('../server/utils/db').connect()
  const es = await require('../server/utils/es').init()
  const indexes = (await es.cat.indices({ index: `${config.indicesPrefix}-*`, format: 'json' })).body
  for (const index of indexes) {
    if (new Date().getTime() - start > maxDuration) {
      console.error('Max duration exceeded, stop')
      break
    }
    const getAliasRes = (await es.indices.getAlias({ index: index.index })).body
    const aliases = getAliasRes[index.index] && getAliasRes[index.index].aliases && Object.keys(getAliasRes[index.index].aliases)
    const alias = aliases.find(alias => index.index.startsWith(alias))
    if (!alias) {
      console.warn(`index ${index.index} does not have matching alias`, index['store.size'])
      continue
    }
    const dataset = await db.collection('datasets').findOne({ id: alias.replace(`${config.indicesPrefix}-`, '') })
    if (!dataset) {
      console.warn(`alias ${alias} does not have matching dataset in database`, index['store.size'])
      continue
    }
    const segments = (await es.cat.segments({ index: index.index, format: 'json' })).body

    // force merge is recommended on read-only indexes only, so rest datasets are excluded
    if (segments.length > 2 && !dataset.isRest) {
      await es.indices.forcemerge({ index: index.index, max_num_segments: 1 })
      console.log(`merged segments for index ${index.index}, number of segments=${segments.length}`)
    }
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
