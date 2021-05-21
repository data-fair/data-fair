const config = require('config')
const geojsonvt = require('geojson-vt')
const path = require('path')
const fs = require('fs-extra')
const vtpbf = require('vt-pbf')
const Pbf = require('pbf')
const flatten = require('flat')
const { gunzip } = require('zlib')
const memoize = require('memoizee')
const MBTiles = require('@mapbox/mbtiles')
const { Transform } = require('stream')
const VectorTile = require('@mapbox/vector-tile').VectorTile
const pump = require('util').promisify(require('pump'))
const tmp = require('tmp-promise')
const JSONStream = require('JSONStream')
const datasetUtils = require('./dataset')
const geoUtils = require('./geo')
const debug = require('debug')('tiles')

const dataDir = path.resolve(config.dataDir)
const exec = require('./exec')

function tile2long(x, z) {
  return (x / Math.pow(2, z) * 360 - 180)
}

function tile2lat(y, z) {
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
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
  var tile = new VectorTile(new Pbf(data))
  for (var layerName in tile.layers) {
    var layer = tile.layers[layerName]
    const updatedFeatures = []
    for (var i = 0; i < layer.length; i++) {
      var feature = layer.feature(i)
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
async function getMbtiles(mbtilesPath, finalizedAt) {
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
  dispose(res) {
    res.mbtiles.close()
  },
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

exports.prepareMbtiles = async (dataset, db, es) => {
  if (config.tippecanoe.skip) {
    return debug('mbtiles creation is entirely skipped')
  }
  if (dataset.count < config.tippecanoe.minFeatures) {
    return debug(`no need to create mbtiles file for less than ${config.tippecanoe.minFeatures} features for dataset ${dataset.id}`)
  }

  const dir = datasetUtils.dir(dataset)
  const tmpDir = path.join(dataDir, 'tmp')
  await fs.ensureDir(tmpDir)
  const parsed = path.parse(dataset.file.name)
  const mbtilesFile = path.join(dir, `${parsed.name}.mbtiles`)
  const geopoints = geoUtils.schemaHasGeopoint(dataset.schema)
  const geoshapes = geoUtils.schemaHasGeometry(dataset.schema)
  const removeProps = dataset.schema.filter(p => geoUtils.allGeoConcepts.includes(p['x-refersTo']))

  const tmpGeojsonFile = await tmp.tmpName({ dir: tmpDir, postfix: '.geojson' })
  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpGeojsonFile)

  // first write a temporary geojson file with all content + extensions + same calculated fields as indexed
  const streams = [
    ...datasetUtils.readStreams(db, dataset, false, dataset.extensions && dataset.extensions.find(e => e.active)),
  ]
  streams.push(new Transform({
    async transform(properties, encoding, callback) {
      properties._id = properties._id || (properties._i + '')
      properties = flatten(properties, { safe: true })
      try {
        let geometry
        if (geopoints) {
          geometry = geoUtils.latlon2fields(dataset, properties)._geoshape
        } else if (geoshapes) {
          geometry = (await geoUtils.geometry2fields(dataset.schema, properties))._geoshape
        }
        if (geometry) {
          for (const prop of removeProps) {
            delete properties[prop.key]
          }
          const feature = { type: 'Feature', properties, geometry }
          callback(null, feature)
        } else {
          callback(null, null)
        }
      } catch (err) {
        callback(err)
      }
    },
    objectMode: true,
  }))

  streams.push(JSONStream.stringify(`{
  "type": "FeatureCollection",
  "features": [
    `, `,
    `, `
  ]
}`))

  streams.push(fs.createWriteStream(tmpGeojsonFile))
  await pump(...streams)

  // Try to prevent weird bug with NFS by forcing syncing file before reading it
  const fd = await fs.open(tmpGeojsonFile, 'r')
  await fs.fsync(fd)
  await fs.close(fd)

  const tippecanoeArgs = [...config.tippecanoe.args, '-n', dataset.title, '-N', dataset.title, '--layer', 'results']
  exports.defaultSelect(dataset).forEach(prop => {
    tippecanoeArgs.push('--include')
    tippecanoeArgs.push(prop)
  })

  const tmpMbtilesFile = await tmp.tmpName({ dir: tmpDir, postfix: '.mbtiles' })

  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpMbtilesFile)
  const sizeBefore = (await fs.stat(tmpMbtilesFile)).size

  let tippecanoeRes
  try {
    if (config.tippecanoe.docker) {
      tippecanoeRes = await exec('docker', ['run', '--rm', '-e', 'TIPPECANOE_MAX_THREADS=1', '-v', `${dataDir}:/data`, 'klokantech/tippecanoe:latest', 'tippecanoe', ...tippecanoeArgs, '-o', tmpMbtilesFile.replace(dataDir, '/data'), tmpGeojsonFile.replace(dataDir, '/data')])
    } else {
      tippecanoeRes = await exec('tippecanoe', [...tippecanoeArgs, '-o', tmpMbtilesFile, tmpGeojsonFile], { env: { TIPPECANOE_MAX_THREADS: '1' } })
    }
  } catch (err) {
    console.error('failed to create mbtiles file', mbtilesFile, err)
    await fs.remove(tmpGeojsonFile)
    await fs.remove(tmpMbtilesFile)

    // delete last one even if we failed, it is deprecated
    await fs.remove(mbtilesFile)
    return
  }
  // this one as only create to run tippecanoe on
  await fs.remove(tmpGeojsonFile)

  // Try to prevent weird bug with NFS by forcing syncing file before using
  const fd2 = await fs.open(tmpMbtilesFile, 'r')
  await fs.fsync(fd2)
  await fs.close(fd2)

  const sizeAfter = (await fs.stat(tmpMbtilesFile)).size
  if (sizeAfter === sizeBefore) {
    debug('mbtiles seems to be empty', mbtilesFile, sizeAfter, tippecanoeRes.stderr, tippecanoeRes.stdout)
    await fs.remove(tmpMbtilesFile)
    // delete previous one even if we failed, it is deprecated
    await fs.remove(mbtilesFile)
  } else {
    debug(`move ${tmpMbtilesFile} => ${mbtilesFile}`)
    // more atomic file write to prevent read during a long write
    await fs.move(tmpMbtilesFile, mbtilesFile, { overwrite: true })
  }
}

exports.deleteMbtiles = async (dataset) => {
  const parsed = path.parse(dataset.file.name)
  const mbtilesFile = path.join(datasetUtils.dir(dataset), `${parsed.name}.mbtiles`)
  await fs.remove(mbtilesFile)
}
