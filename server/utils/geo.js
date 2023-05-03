const path = require('path')
const config = require('config')
const util = require('util')
const fs = require('fs')
const pointOnFeature = require('@turf/point-on-feature').default
const bboxPolygon = require('@turf/bbox-polygon').default
const turfBbox = require('@turf/bbox').default
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
const projectGeomUri = 'http://data.ign.fr/def/geometrie#Geometry'
const dataDir = path.resolve(config.dataDir)

exports.allGeoConcepts = [geomUri, projectGeomUri, latlonUri, ...latUri, ...lonUri, coordXUri, coordYUri]

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
  const geom = schema.find(p => p['x-refersTo'] === geomUri)
  if (geom) return geom.key
  const projectGeom = schema.find(p => p['x-refersTo'] === projectGeomUri)
  if (projectGeom) return projectGeom.key
  return false
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

  if (lat === undefined || lon === undefined) return {}
  return {
    _geopoint: lat + ',' + lon
  }
}

// Geometry can be passed as an object, as a geojson string or as a WKT string
exports.readGeometry = (value) => {
  if (!value || value === 'undefined') return null
  if (typeof value === 'object') {
    if (!value.coordinates) return null
    return JSON.parse(JSON.stringify(value))
  }
  try {
    return JSON.parse(value)
  } catch (err) {
    try {
      return wktToGeoJSON(value)
    } catch (err2) {
      console.log('invalid JSON or WKT', value, err, err2)
      throw new Error('la géométrie ne contient pas de JSON ou de WKT valide')
    }
  }
}

const projCoordinates = (projection, coordinates) => {
  if (Array.isArray(coordinates[0])) {
    for (const coords of coordinates) {
      projCoordinates(projection, coords)
    }
  } else if (coordinates.length === 2) {
    const projCoords = proj4(projection.proj4, 'WGS84', coordinates)
    coordinates[0] = projCoords[0]
    coordinates[1] = projCoords[1]
  }
}

exports.geometry2fields = async (dataset, doc) => {
  const schema = dataset.schema
  let geometry, capabilities

  const projectGeomProp = schema.find(p => p['x-refersTo'] === projectGeomUri)
  const geomProp = schema.find(p => p['x-refersTo'] === geomUri)

  if (projectGeomProp) {
    geometry = this.readGeometry(doc[projectGeomProp.key])
    if (geometry) {
      const projection = dataset.projection && dataset.projection.code && projections.find(p => p.code === dataset.projection.code)
      if (dataset.projection && !projection) throw new Error(`La projection ${dataset.projection.code} n'est pas supportée.`)
      if (projection) {
        projCoordinates(projection, geometry.coordinates)
      }
    }
    capabilities = projectGeomProp['x-capabilities']
  } else {
    geometry = this.readGeometry(doc[geomProp.key])
    capabilities = geomProp['x-capabilities']
  }
  if (!geometry || Object.keys(geometry).length === 0) return {}

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
  const point = pointOnFeature(feature)
  const fields = {
    _geopoint: point.geometry.coordinates[1] + ',' + point.geometry.coordinates[0]
  }
  if (!capabilities || capabilities.geoCorners !== false) {
    const polygon = bboxPolygon(turfBbox(feature))
    fields._geocorners = polygon.geometry.coordinates[0].map(c => c[1] + ',' + c[0])
  }
  fields._geoshape = feature.geometry
  return fields
}

exports.result2geojson = esResponse => {
  return {
    type: 'FeatureCollection',
    total: esResponse.hits.total.value,
    features: esResponse.hits.hits.map(hit => {
      const { _geoshape, ...properties } = hit._source
      let geometry = _geoshape
      if (!geometry && properties._geopoint) {
        const [lat, lon] = properties._geopoint.split(',')
        delete properties._geopoint
        geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
      }
      return {
        type: 'Feature',
        id: hit._id,
        geometry,
        properties: flatten({ ...properties, _id: hit._id }, { safe: true })
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

exports.result2wkt = esResponse => {
  const geometryCollection = {
    type: 'GeometryCollection',
    geometries: esResponse.hits.hits.map(hit => {
      let geometry = hit._source._geoshape
      if (!geometry && hit._source._geopoint) {
        const [lat, lon] = hit._source._geopoint.split(',')
        geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
      }
      return geometry
    }).filter(geometry => !!geometry)
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
        else {
          for (const c of childPolygon.geometry.coordinates) {
            newCoordinates.push(c)
          }
        }
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
    tmpFile = await tmp.file({ postfix: '.geojson', dir: path.join(dataDir, 'tmp') })
    await writeFile(tmpFile.fd, JSON.stringify(feature))
    const repaired = await exec(`prepair --ogr '${tmpFile.path}'`, { maxBuffer: 100000000 })
    feature.geometry = wktToGeoJSON(repaired.stdout)
    return feature
  } catch (err) {
    if (tmpFile) tmpFile.cleanup()
    throw err
  }
}
