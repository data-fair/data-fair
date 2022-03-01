const geojsonvt = require('geojson-vt')
const vtpbf = require('vt-pbf')
const Pbf = require('pbf')
const { gunzip } = require('zlib')
const memoize = require('memoizee')
const MBTiles = require('@mapbox/mbtiles')
const VectorTile = require('@mapbox/vector-tile').VectorTile

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

exports.geojson2pbf = (geojson, xyz) => {
  if (!geojson || !geojson.features || !geojson.features.length) return null
  const layers = {}
  // indexMaxZoom=0 -> do not pre-render tiles
  // tolerance=4 -> slightly higher simplification than default (3)
  // maxZoom=24 -> no inconvenience to preserve details up to 24 as we build dedicated geojson-vt index each time
  // and do not share indexes in memory
  const tile = geojsonvt(geojson, { indexMaxZoom: 0, tolerance: 4, maxZoom: 24 }).getTile(xyz[2], xyz[0], xyz[1])
  if (tile) layers.results = tile
  return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }))
}

const selectInVT = (data, select) => {
  const tile = new VectorTile(new Pbf(data))
  for (const layerName in tile.layers) {
    const layer = tile.layers[layerName]
    const updatedFeatures = []
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      for (const key of Object.keys(feature.properties)) {
        if (!select.includes(key)) delete feature.properties[key]
      }
      updatedFeatures.push(feature)
    }
    // monkey patch layer.feature() so that it doesn't reprocess the pbf on next call
    layer.feature = (i) => updatedFeatures[i]
  }
  return Buffer.from(vtpbf(tile))
}

// finalizedAt is only here to invalidate memoize cache
async function getMbtiles (mbtilesPath, finalizedAt) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-new
    new MBTiles(`${mbtilesPath}?mode=ro`, (err, mbtiles) => {
      if (err) return reject(err)
      mbtiles.getInfo((err, info) => {
        if (err) return reject(err)
        resolve({ mbtiles, info })
      })
    })
  })
}

// manage a few active connections to prevent both always reopening connections to mbtiles
// and keeping connections opended indefinitely
const memoizedGetMbtiles = memoize(getMbtiles, {
  promise: true,
  max: 200,
  maxAge: 10000,
  preFetch: true,
  dispose (res) {
    res.mbtiles.close()
  }
})

exports.getTile = async (dataset, mbtilesPath, select, x, y, z) => {
  const { mbtiles, info } = await memoizedGetMbtiles(mbtilesPath, dataset.finalizedAt)

  /* decomment in dev to inspect content of mbtiles
  console.log('info', info)
  for await (const tilesPacket of mbtiles.createZXYStream()) {
    console.log(tilesPacket.toString())
  } */
  if (z > info.maxzoom || z < info.minzoom) {
    // false means that the tile is out the range of what the mbtiles serves
    return false
  }
  return new Promise((resolve, reject) => {
    mbtiles.getTile(z, x, y, (err, data, headers) => {
      if (err) {
        if (/does not exist/.test(err.message)) return resolve(null)
        return reject(err)
      }

      gunzip(data, (err, unzipped) => {
        if (err) return reject(err)
        if (select) {
          resolve(selectInVT(unzipped, select))
        } else {
          resolve(unzipped)
        }
      })
      /* if (headers['Content-Encoding'] === 'gzip') {
        data = await gunzip(data)
      } */
      // resolve({ data, headers })
    })
  })
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
