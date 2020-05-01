const geolib = require('geolib')
const ngeohash = require('ngeohash')

const geohash = module.exports = {}

// source https://en.wikipedia.org/wiki/Geohash
const errorsPerPrecision = [2500, 630, 78, 20, 2.4, 0.61, 0.076, 0.019]
geohash.precision2area = errorsPerPrecision.map(error => (error * 2) * (error * 2))

geohash.bbox2area = function(bbox) {
  const width = geolib.getDistance({
    longitude: bbox[0], // left
    latitude: bbox[1], // bottom
  }, {
    longitude: bbox[2], // right
    latitude: bbox[1], // bottom
  }) / 1000

  const height = geolib.getDistance({
    longitude: bbox[0], // left
    latitude: bbox[1], // bottom
  }, {
    longitude: bbox[2], // left
    latitude: bbox[1], // top
  }) / 1000

  return width * height
}

geohash.bbox2precision = function(bbox, facetMax) {
  const bboxArea = geohash.bbox2area(bbox)
  let precision = 1
  while (geohash.precision2area[precision] && (bboxArea / geohash.precision2area[precision]) < facetMax) {
    precision += 1
  }
  return precision
}

geohash.hash2bbox = function(hash) {
  // from a ngeohash (minlat,minlon,maxlat,maxlon) to a geojson (minlon,minlat,maxlon,maxlat) bounding box
  const ngeohashBBox = ngeohash.decode_bbox(hash)
  return [ngeohashBBox[1], ngeohashBBox[0], ngeohashBBox[3], ngeohashBBox[2]]
}

geohash.hash2coord = function(hash) {
  const r = ngeohash.decode(hash)
  return [r.longitude, r.latitude]
}
