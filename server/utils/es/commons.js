// Logic shared across all of most search and aggregation routes

const config = require('config')
const createError = require('http-errors')
const flatten = require('flat')
const thumbor = require('../thumbor')
const tiles = require('../tiles')

// From a property in data-fair schema to the property in an elasticsearch mapping
exports.esProperty = prop => {
  // Add inner text field to almost everybody so that even dates, numbers, etc can be matched textually as well as exactly
  const innerTextField = { text: { type: 'text', analyzer: config.elasticsearch.defaultAnalyzer, fielddata: true } }
  let esProp = {}
  if (prop.type === 'object') esProp = { type: 'object' }
  if (prop.type === 'integer') esProp = { type: 'long', fields: innerTextField }
  if (prop.type === 'number') esProp = { type: 'double', fields: innerTextField }
  if (prop.type === 'boolean') esProp = { type: 'boolean', fields: innerTextField }
  if (prop.type === 'string' && prop.format === 'date-time') esProp = { type: 'date', fields: innerTextField }
  if (prop.type === 'string' && prop.format === 'date') esProp = { type: 'date', fields: innerTextField }
  // uri-reference and full text fields are managed in the same way from now on, because we want to be able to aggregate on small full text fields
  // TODO: maybe ignore_above should be only for uri-reference fields
  if (prop.type === 'string' && (prop.format === 'uri-reference' || !prop.format)) esProp = { type: 'keyword', ignore_above: 200, fields: innerTextField }
  // Do not index geometry, it will be copied and simplified in _geoshape
  if (prop['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    esProp.index = false
  }
  // Hard coded geo properties
  if (prop.key === '_geopoint') esProp = { type: 'geo_point' }
  if (prop.key === '_geoshape') esProp = { type: 'geo_shape' }
  if (prop.key === '_geocorners') esProp = { type: 'geo_point' }
  return esProp
}

exports.aliasName = dataset => {
  const ids = dataset.isVirtual ? dataset.virtual.children : [dataset.id]
  return ids.map(id => `${config.indicesPrefix}-${id}`).join(',')
}

exports.parseSort = (sortStr, fields) => {
  if (!sortStr) return []
  return sortStr.split(',').map(s => {
    let field, direction
    if (s.indexOf('-') === 0) {
      field = s.slice(1)
      direction = 'desc'
    } else {
      field = s
      direction = 'asc'
    }
    if (!fields.concat(['_key', '_count', '_time']).includes(field)) {
      throw createError(400, `Impossible de trier sur le champ ${field}, il n'existe pas dans le jeu de données.`)
    }
    return { [field]: direction }
  })
}

exports.prepareQuery = (dataset, query) => {
  const esQuery = {}

  // Pagination
  esQuery.size = query.size ? Number(query.size) : 20
  if (esQuery.size > 10000) throw createError(400, '"size" cannot be more than 10000')
  esQuery.from = (query.page ? Number(query.page) - 1 : 0) * esQuery.size

  // Select fields to return
  const fields = dataset.schema.map(f => f.key)
  esQuery._source = (query.select && query.select !== '*') ? query.select.split(',') : fields
  const unknownField = esQuery._source.find(s => !fields.includes(s))
  if (unknownField) throw createError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données.`)

  // Others are included depending on the context
  if (query.thumbnail) {
    const imageField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    if (imageField && query.select && !esQuery._source.includes.includes(imageField.key)) {
      esQuery._source.includes.push(imageField.key)
    }
  }

  // Sort by list of fields (prefixed by - for descending sort)
  esQuery.sort = exports.parseSort(query.sort, fields)
  // Also implicitly sort by score
  esQuery.sort.push('_score')
  // And lastly random order for natural distribution (mostly important for geo results)
  esQuery.sort.push('_rand')

  // Simple highlight management
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-highlighting.html
  if (query.highlight) {
    esQuery.highlight = { fields: {}, no_match_size: 300, fragment_size: 100, pre_tags: ['<em class="highlighted">'], post_tags: ['</em>'] }
    query.highlight.split(',').forEach(key => {
      if (!fields.includes(key)) throw createError(400, `Impossible de demander un "highlight" sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      esQuery.highlight.fields[key + '.text'] = {}
    })
  }

  const filter = []
  const must = []

  // query and simple query string for a lot of functionalities in a simple exposition (too open ??)
  // const multiFields = [...fields].concat(dataset.schema.filter(f => f.type === 'string').map(f => f.key + '.text'))
  const searchFields = []
  dataset.schema.forEach(f => {
    const esProp = exports.esProperty(f)
    if (esProp.type === 'keyword') searchFields.push(f.key)
    if (esProp.fields && esProp.fields.text) searchFields.push(f.key + '.text')
  })
  if (query.qs) {
    must.push({ query_string: { query: query.qs, fields: searchFields } })
  }
  if (query.q) {
    must.push({ simple_query_string: { query: query.q, fields: searchFields } })
  }

  // bounding box filter to restrict results on geo zone: left,bottom,right,top
  if (query.bbox || query.xyz) {
    if (!dataset.bbox) throw createError(400, '"bbox" filter cannot be used on this dataset. It is not geolocalized.')
    const bbox = exports.getQueryBBOX(query, dataset)
    const esBoundingBox = { left: bbox[0], bottom: bbox[1], right: bbox[2], top: bbox[3] }
    // use geo_shape intersection instead geo_bounding_box in order to get even
    // partial geometries in tiles
    filter.push({ geo_shape: { _geoshape: {
      relation: 'intersects',
      shape: {
        type: 'envelope',
        coordinates: [[esBoundingBox.left, esBoundingBox.top], [esBoundingBox.right, esBoundingBox.bottom]]
      }
    } } })
  }

  esQuery.query = { bool: { filter, must } }

  return esQuery
}

exports.getQueryBBOX = (query) => {
  let bbox
  if (query.bbox) {
    bbox = query.bbox.split(',').map(Number)
  } else if (query.xyz) {
    bbox = tiles.xyz2bbox(...query.xyz.split(',').map(Number))
  }
  return bbox
}

exports.prepareResultItem = (hit, dataset, query) => {
  const res = flatten(hit._source)
  res._score = hit._score
  if (query.highlight) {
    // return hightlight results and remove .text suffix of fields
    res._highlight = query.highlight.split(',')
      .reduce((a, key) => {
        a[key] = (hit.highlight && hit.highlight[key + '.text']) || []
        return a
      }, {})
  }
  if (query.thumbnail) {
    const imageField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    if (!imageField) return res.status(400).send('Thumbnail management is only available if the "image" concept is associated to a field of the dataset.')
    res._thumbnail = thumbor.thumbnail(res[imageField.key], query.thumbnail)
  }
  return res
}
