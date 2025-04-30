// this is run in a thread as it is quite cpu and memory intensive

import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'
import _config from 'config'

const config = /** @type {any} */(_config)

export default ({ geojson, xyz }) => {
  const layers = {}
  // indexMaxZoom=0 -> do not pre-render tiles
  // tolerance=4 -> slightly higher simplification than default (3)
  const tile = geojsonvt(geojson, { indexMaxZoom: 0, tolerance: config.tiles.geojsonvtTolerance, maxZoom: xyz[2] })
    .getTile(xyz[2], xyz[0], xyz[1])
  if (tile) layers.results = tile
  return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }))
}
