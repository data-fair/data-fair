const util = require('util')
const fs = require('fs')
const turf = require('@turf/turf')
const rewind = require('@turf/rewind').default
const cleanCoords = require('@turf/clean-coords').default
const kinks = require('@turf/kinks').default
const unkink = require('@turf/unkink-polygon').default
const flatten = require('flat')
const exec = require('child-process-promise').exec
const tmp = require('tmp-promise')
const writeFile = util.promisify(fs.writeFile)
const proj4 = require('proj4')
const { wktToGeoJSON, geojsonToWKT } = require('@terraformer/wkt')
const debug = require('debug')('geo')

const projections = require('../../contract/projections')
const geomUri = 'https://purl.org/geojson/vocab#geometry'
const latlonUri = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
const latUri = ['http://schema.org/latitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#lat']
const lonUri = ['http://schema.org/longitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#long']
const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'

exports.allGeoConcepts = [geomUri, latlonUri, ...latUri, ...lonUri, coordXUri, coordYUri]

exports.schemaHasGeopoint = (schema) => {
  const lat = schema.find(p => latUri.indexOf(p['x-refersTo']) !== -1)
  const lon = schema.find(p => lonUri.indexOf(p['x-refersTo']) !== -1)
  if (lat && lon) return `${lat.key}/${lon.key}`
  const x = schema.find(p => p['x-refersTo'] === coordXUri)
  const y = schema.find(p => p['x-refersTo'] === coordYUri)
  if (x && y) return `${x.key}/${y.key}`
  const latlon = schema.find(p => !p['x-calculated'] && p['x-refersTo'] === latlonUri)
  if (latlon) return latlon.key
  return false
}

exports.schemaHasGeometry = (schema) => {
  const field = schema.find(p => p['x-refersTo'] === geomUri)
  return (field && field.key) || false
}

exports.geoFieldsKey = (schema) => {
  return exports.schemaHasGeometry(schema) + '/' + exports.schemaHasGeopoint(schema)
}

exports.fixLon = (val) => {
  while (val < -180) val += 360
  while (val > 180) val -= 360
  return val
}

exports.latlon2fields = (dataset, doc) => {
  const schema = dataset.schema
  let lat, lon

  const coordXProp = schema.find(p => p['x-refersTo'] === coordXUri)
  const coordYProp = schema.find(p => p['x-refersTo'] === coordYUri)
  if (coordXProp && coordYProp && doc[coordXProp.key] !== undefined && doc[coordYProp.key] !== undefined) {
    const projection = dataset.projection && dataset.projection.code && projections.find(p => p.code === dataset.projection.code)
    if (dataset.projection && !projection) throw new Error(`La projection ${dataset.projection.code} n'est pas supportée.`)
    if (!projection) {
      lon = doc[coordXProp.key]
      lat = doc[coordYProp.key]
    } else {
      [lon, lat] = proj4(projection.proj4, 'WGS84', [doc[coordXProp.key], doc[coordYProp.key]])
    }
  }

  const latlonProp = schema.find(p => p['x-refersTo'] === latlonUri)
  if (latlonProp && doc[latlonProp.key]) [lat, lon] = doc[latlonProp.key].split(/[,;]/)

  const latProp = schema.find(p => latUri.indexOf(p['x-refersTo']) !== -1)
  const lonProp = schema.find(p => lonUri.indexOf(p['x-refersTo']) !== -1)
  if (latProp && lonProp && doc[latProp.key] !== undefined && doc[lonProp.key] !== undefined) {
    lat = doc[latProp.key]
    lon = doc[lonProp.key]
  }

  if (!lat || !lon) return {}
  return {
    _geopoint: lat + ',' + lon,
  }
}

// Geometry can be passed as an object, as a geojson string or as a WKT string
exports.readGeometry = (value) => {
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (err) {
    return wktToGeoJSON(value)
  }
}

exports.geometry2fields = async (schema, doc) => {
  const prop = schema.find(p => p['x-refersTo'] === geomUri)
  if (!prop || !doc[prop.key] || doc[prop.key] === '{}' || doc[prop.key] === {} || doc[prop.key] === 'undefined') return {}
  const geometry = this.readGeometry(doc[prop.key])
  const feature = { type: 'Feature', geometry }
  // Do the best we can to fix invalid geojson
  try {
    cleanCoords(feature, { mutate: true })
  } catch (err) {
    debug('Failure while applying cleanCoords to geojson', err)
  }
  try {
    rewind(feature, { mutate: true })
  } catch (err) {
    debug('Failure while applying rewind to geojson', err)
  }
  try {
    if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      const kinked = !!kinks(feature).features.length
      if (kinked) {
        await customUnkink(feature)
      }
    }
  } catch (err) {
    debug('Failure while removing self intersections from geojson polygons', err)
  }

  // check if simplify is a good idea ? too CPU intensive for our backend ?
  // const simplified = turf.simplify({type: 'Feature', geometry: JSON.parse(doc[prop.key])}, {tolerance: 0.01, highQuality: false})

  const point = turf.pointOnFeature(feature)
  const fields = {
    _geopoint: point.geometry.coordinates[1] + ',' + point.geometry.coordinates[0],
  }
  if (!prop['x-capabilities'] || prop['x-capabilities'].geoCorners !== false) {
    const bboxPolygon = turf.bboxPolygon(turf.bbox(feature))
    fields._geocorners = bboxPolygon.geometry.coordinates[0].map(c => c[1] + ',' + c[0])
  }
  if (!prop['x-capabilities'] || prop['x-capabilities'].geoShape !== false) {
    fields._geoshape = feature.geometry
  }
  return fields
}

exports.result2geojson = esResponse => {
  return {
    type: 'FeatureCollection',
    total: esResponse.hits.total.value,
    features: esResponse.hits.hits.map(hit => {
      const { _geoshape, ...properties } = hit._source
      let geometry = hit._source._geoshape
      if (!geometry) {
        const [lat, lon] = hit._source._geopoint.split(',')
        geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
      }
      return {
        type: 'Feature',
        id: hit._id,
        geometry,
        properties: flatten({ ...properties, _id: hit._id }, { safe: true }),
      }
    }),
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
          coordinates: [centroid.lon, centroid.lat],
        },
        bbox,
        properties,
      }
    }),
  }
}

exports.result2wkt = esResponse => {
  const geometryCollection = {
    type: 'GeometryCollection',
    geometries: esResponse.hits.hits.map(hit => {
      let geometry = hit._source._geoshape
      if (!geometry) {
        const [lat, lon] = hit._source._geopoint.split(',')
        geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
      }
      return geometry
    }),
  }
  return geojsonToWKT(geometryCollection)
}

// Simple wrapping of the command line prepair https://github.com/tudelft3d/prepair
// help fixing some polygons
const customUnkink = async (feature) => {
  let tmpFile
  try {
    if (feature.geometry.type === 'MultiPolygon') {
      const newCoordinates = []
      for (const coordinates of feature.geometry.coordinates) {
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
    debug('Failed to use the prepair command line tool', err)
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
    const repaired = await exec(`prepair --ogr '${tmpFile.path}'`, { maxBuffer: 100000000 })
    feature.geometry = wktToGeoJSON(repaired.stdout)
    return feature
  } catch (err) {
    if (tmpFile) tmpFile.cleanup()
    throw err
  }
}
