const latlon = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
const lat = ['http://schema.org/latitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#lat']
const lon = ['http://schema.org/longitude', 'http://www.w3.org/2003/01/geo/wgs84_pos#long']

exports.schemaHasGeopoint = (schema) => {
  if (schema.find(p => p['x-refersTo'] === latlon)) return true
  if (schema.find(p => lat.indexOf(p['x-refersTo']) !== -1) && schema.find(p => lon.indexOf(p['x-refersTo']) !== -1)) return true
  return false
}

exports.getGeopoint = (schema, doc) => {
  const latlonProp = schema.find(p => p['x-refersTo'] === latlon)
  if (latlonProp) return doc[latlonProp.key]

  const latProp = schema.find(p => lat.indexOf(p['x-refersTo']) !== -1)
  const lonProp = schema.find(p => lon.indexOf(p['x-refersTo']) !== -1)
  if (latProp && lonProp && doc[latProp.key] !== undefined && doc[lonProp.key] !== undefined) return doc[latProp.key] + ',' + doc[lonProp.key]
}
