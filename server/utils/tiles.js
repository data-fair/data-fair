const path = require('path')
const Piscina = require('piscina')

const geojson2pbfPiscina = new Piscina({
  filename: path.resolve(__dirname, '../threads/geojson2pbf.js'),
  maxThreads: 1
})

function tile2long (x, z) {
  return (x / Math.pow(2, z) * 360 - 180)
}

function tile2lat (y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))))
}

// cf https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_.28JavaScript.2FActionScript.2C_etc..29
exports.xyz2bbox = (x, y, z) => {
  // left ,bottom,right,top
  return [tile2long(x, z), tile2lat(y + 1, z), tile2long(x + 1, z), tile2lat(y, z)]
}

exports.geojson2pbf = async (geojson, xyz) => {
  if (!geojson || !geojson.features || !geojson.features.length) return null
  console.log(JSON.stringify(geojson).length)
  const buf = Buffer.from(await geojson2pbfPiscina.run({ geojson, xyz }))
  console.log(buf.length)
  return buf
}

exports.defaultSelect = (dataset) => {
  return dataset.schema.filter(prop => {
    if (prop.key === '_id') return true
    if (prop.key === '_i') return true
    if (prop.key.startsWith('_')) return false
    if (prop.type === 'integer') return true
    if (prop.type === 'number') return true
    if (prop.type === 'boolean') return true
    if (prop.type === 'string' && prop.format === 'date-time') return true
    if (prop.type === 'string' && prop.format === 'date') return true
    if (prop.type === 'string' && 'x-cardinality' in prop && prop['x-cardinality'] <= 50) return true
    if (prop.type === 'string' && prop['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label') return true
    return false
  }).map(prop => prop.key)
}
