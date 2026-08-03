import { es, resetIndex, bulkIndex, assert, finding } from './es.ts'

const info = await es('GET', '/')
finding(`dev ES version ${info.version.number}`)
assert(info.version.number.startsWith('8.'), 'expected ES 8.x')
await resetIndex('spike-smoke', { mappings: { properties: { a: { type: 'keyword' } } } })
await bulkIndex('spike-smoke', [{ a: 'x' }, { a: 'y' }])
await es('DELETE', '/spike-smoke')
console.log('smoke OK')
