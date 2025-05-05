// this is run in a thread as it is quite cpu and memory intensive

import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'
import _config from 'config'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'

const config = /** @type {any} */(_config)

export default ({ geojson, xyz, vtPrepared }) => {
  let pbf
  if (vtPrepared) {
    const tile = {
      layers: {
        results: new PseudoTileLayer(geojson)
      }
    }
    pbf = vtpbf.fromVectorTileJs(tile)
  } else {
    // indexMaxZoom=0 -> do not pre-render tiles
    const tile = geojsonvt(geojson, { indexMaxZoom: 0, tolerance: config.tiles.geojsonvtTolerance, maxZoom: xyz[2] })
      .getTile(xyz[2], xyz[0], xyz[1])
    const layers = {}
    if (tile) layers.results = tile
    pbf = vtpbf.fromGeojsonVt(layers, { version: 2 })
  }

  return Buffer.from(pbf)
}

class PseudoTileLayer {
  version = 2
  name = 'results'
  extent = 4096
  length
  queue
  geojson
  constructor (geojson) {
    this.geojson = geojson
    this.queue = []
    for (let f = 0; f < geojson.features.length; f++) {
      const feature = geojson.features[f]
      let tile
      if (feature.properties._vt) {
        tile = new VectorTile(new Protobuf(Buffer.from(feature.properties._vt, 'base64')))
        delete feature.properties._vt
        for (let ff = 0; ff < tile.layers.f.length; ff++) {
          this.queue.push([f, ff, tile])
        }
      }
    }
    this.length = this.queue.length
  }

  lastI = -1
  feature (i) {
    if (i !== this.lastI + 1) throw new Error('PseudoTileLayer can only be read sequentially')
    const item = this.queue[i]
    this.lastI = i
    return new PseudoFeature(this.geojson.features[item[0]].properties, item[2], item[1])
  }
}

class PseudoFeature {
  f
  type
  properties
  id
  constructor (properties, tile, i) {
    this.properties = properties
    this.f = tile.layers.f.feature(i)
    this.type = this.f.type
    this.id = properties._id
  }

  loadGeometry () {
    return this.f.loadGeometry()
  }
}
