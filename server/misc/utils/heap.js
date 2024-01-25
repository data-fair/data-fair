// Use the DEBUG_HEAP environment variable to activate debugging the memory use
// the value is the prefix of the debugHeap instructions that you want to see, for example:
// export DEBUG_HEAP=worker:indexer

const NumberAbbreviate = require('number-abbreviate')
const numberAbbreviate = new NumberAbbreviate([' k', ' M', ' G', ' T'])

if (global.gc) console.log('Manual garbage collection is available')

const f = val => Math.round((val / 1024 / 1024)).toLocaleString({}) + 'Mo'

exports.debug = (prefix) => (key, value) => {
  if (!process.env.DEBUG_HEAP) return
  if (process.env.DEBUG_HEAP !== '*' && !prefix.startsWith(process.env.DEBUG_HEAP)) return

  const v8 = require('v8')
  const chalk = require('chalk')

  if (global.gc) global.gc()
  const stats = v8.getHeapStatistics()
  let msg = chalk.magenta(`[${prefix}:${key}]`) + ` physical=${chalk.magenta(f(stats.total_physical_size))}, used=${f(stats.used_heap_size)}, total=${f(stats.total_heap_size)}, executable=${f(stats.total_heap_size_executable)}, limit=${f(stats.heap_size_limit)}`
  if (value) {
    const sizeof = require('object-sizeof')
    msg += ', object size=' + numberAbbreviate.abbreviate(sizeof(value), 1) + 'b'
  }
  console.log(msg)
}
