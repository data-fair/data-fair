// this is run in a thread as it is quite cpu and memory intensive

const geojsonvt = require('geojson-vt')
const vtpbf = require('vt-pbf')

module.exports = ({ geojson, xyz }) => {
  const layers = {}
  // indexMaxZoom=0 -> do not pre-render tiles
  // tolerance=4 -> slightly higher simplification than default (3)
  // maxZoom=24 -> no inconvenience to preserve details up to 24 as we build dedicated geojson-vt index each time
  // and do not share indexes in memory
  const tile = geojsonvt(geojson, { indexMaxZoom: 0, tolerance: 4, maxZoom: 24 })
    .getTile(xyz[2], xyz[0], xyz[1])
  if (tile) layers.results = tile
  return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }))
}
