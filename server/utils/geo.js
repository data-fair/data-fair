const util = require('util')
const fs = require('fs')
const turf = require('@turf/turf')
const rewind = require('@turf/rewind').default
const cleanCoords = require('@turf/clean-coords').default
const kinks = require('@turf/kinks').default
const unkink = require('@turf/unkink-polygon').default
const flatten = require('flat')
const exec = require('child-process-promise').exec
const wktParser = require('terraformer-wkt-parser')
const tmp = require('tmp-promise')
const writeFile = util.promisify(fs.writeFile)

const geomUri = 'https://purl.org/geojson/vocab#geometry'
const latlonUri = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
const latUri = ['http://schema.org/latitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#lat']
const lonUri = ['http://schema.org/longitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#long']

exports.schemaHasGeopoint = (schema) => {
  if (schema.find(p => p['x-refersTo'] === latlonUri)) return true
  if (schema.find(p => latUri.indexOf(p['x-refersTo']) !== -1) && schema.find(p => lonUri.indexOf(p['x-refersTo']) !== -1)) return true
  return false
}

exports.schemaHasGeometry = (schema) => {
  return !!schema.find(p => p['x-refersTo'] === geomUri)
}

exports.latlon2fields = (schema, doc) => {
  let lat, lon
  const latlonProp = schema.find(p => p['x-refersTo'] === latlonUri)
  if (latlonProp && doc[latlonProp.key]) [lat, lon] = doc[latlonProp.key].split(',')

  const latProp = schema.find(p => latUri.indexOf(p['x-refersTo']) !== -1)
  const lonProp = schema.find(p => lonUri.indexOf(p['x-refersTo']) !== -1)
  if (latProp && lonProp && doc[latProp.key] !== undefined && doc[lonProp.key] !== undefined) {
    lat = doc[latProp.key]
    lon = doc[lonProp.key]
  }

  if (!lat || !lon) return {}
  return {
    _geopoint: lat + ',' + lon,
    _geoshape: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
    _geocorners: [lat + ',' + lon]
  }
}

exports.geometry2fields = async (schema, doc) => {
  const prop = schema.find(p => p['x-refersTo'] === geomUri)
  if (!prop || !doc[prop.key] || doc[prop.key] === '{}' || doc[prop.key] === {} || doc[prop.key] === 'undefined') return {}
  // Geometry can be passed serialized in a string, or as an object
  const geometry = typeof doc[prop.key] === 'string' ? JSON.parse(doc[prop.key]) : doc[prop.key]
  const feature = { type: 'Feature', geometry }
  // Do the best we can to fix invalid geojson
  try {
    cleanCoords(feature, { mutate: true })
  } catch (err) {
    console.error('Failure while applying cleanCoords to geojson', err)
  }
  try {
    rewind(feature, { mutate: true })
  } catch (err) {
    console.error('Failure while applying rewind to geojson', err)
  }
  try {
    if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      const kinked = !!kinks(feature).features.length
      if (kinked) {
        await customUnkink(feature)
      }
    }
  } catch (err) {
    console.error('Failure while removing self intersections from geojson polygons', err)
  }

  // check if simplify is a good idea ? too CPU intensive for our backend ?
  // const simplified = turf.simplify({type: 'Feature', geometry: JSON.parse(doc[prop.key])}, {tolerance: 0.01, highQuality: false})

  const centroid = turf.centroid(feature)
  const bboxPolygon = turf.bboxPolygon(turf.bbox(feature))
  return {
    _geopoint: centroid.geometry.coordinates[1] + ',' + centroid.geometry.coordinates[0],
    _geoshape: feature.geometry,
    _geocorners: bboxPolygon.geometry.coordinates[0].map(c => c[1] + ',' + c[0])
  }
}

exports.result2geojson = esResponse => {
  return {
    type: 'FeatureCollection',
    total: esResponse.hits.total,
    features: esResponse.hits.hits.map(hit => {
      const { _geoshape, ...properties } = hit._source
      return {
        type: 'Feature',
        id: hit._id,
        geometry: hit._source._geoshape,
        properties: flatten({ ...properties, _id: hit._id })
      }
    })
  }
}

exports.aggs2geojson = aggsResult => {
  return {
    type: 'FeatureCollection',
    total: aggsResult.total,
    features: aggsResult.aggs.map(agg => {
      const { centroid, bbox, ...properties } = agg
      return {
        type: 'Feature',
        id: agg.value,
        geometry: {
          type: 'Point',
          coordinates: [centroid.lon, centroid.lat]
        },
        bbox,
        properties
      }
    })
  }
}

// Simple wrapping of the command line prepair https://github.com/tudelft3d/prepair
// help fixing some polygons
const customUnkink = async (feature) => {
  let tmpFile
  try {
    if (feature.geometry.type === 'MultiPolygon') {
      const newCoordinates = []
      for (let coordinates of feature.geometry.coordinates) {
        const childPolygon = { type: 'Feature', geometry: { type: 'Polygon', coordinates } }
        await prepair(childPolygon)
        if (childPolygon.geometry.type === 'Polygon') newCoordinates.push(childPolygon.geometry.coordinates)
        else childPolygon.geometry.coordinates.forEach(c => newCoordinates.push(c))
      }
      feature.geometry.coordinates = newCoordinates
    } else {
      await prepair(feature)
    }
  } catch (err) {
    console.error('Failed to use the prepair command line tool', err)
    const unkinked = unkink(feature)
    feature.geometry = { type: 'MultiPolygon', coordinates: unkinked.features.map(f => f.geometry.coordinates) }
  }
  if (tmpFile) tmpFile.cleanup()
}

const prepair = async (feature) => {
  let tmpFile
  try {
    // const wkt = wktParser.convert(feature.geometry)
    tmpFile = await tmp.file({ postfix: '.geojson' })
    await writeFile(tmpFile.fd, JSON.stringify(feature))
    const repaired = await exec(`../prepair/prepair --ogr '${tmpFile.path}'`, { maxBuffer: 100000000 })
    feature.geometry = wktParser.parse(repaired.stdout)
    return feature
  } catch (err) {
    if (tmpFile) tmpFile.cleanup()
    throw err
  }
}
