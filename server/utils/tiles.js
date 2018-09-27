const geojsonvt = require('geojson-vt')
const vtpbf = require('vt-pbf')

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
