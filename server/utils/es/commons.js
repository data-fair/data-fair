// Logic shared across all of most search and aggregation routes

const config = require('config')
const createError = require('http-errors')
const flatten = require('flat')
const thumbor = require('../thumbor')
const tiles = require('../tiles')

exports.aliasName = dataset => {
  const ids = dataset.isVirtual ? dataset.virtual.children : [dataset.id]
  return ids.map(id => `${config.indicesPrefix}-${id}`).join(',')
}

exports.parseSort = (sortStr) => {
  if (!sortStr) return []
  return sortStr.split(',').map(s => {
    if (s.indexOf('-') === 0) return { [s.slice(1)]: 'desc' }
    else return { [s]: 'asc' }
  })
}

exports.prepareQuery = (dataset, query) => {
  const esQuery = {}

  // Pagination
  esQuery.size = query.size ? Number(query.size) : 20
  if (esQuery.size > 10000) throw createError(400, '"size" cannot be more than 10000')
  esQuery.from = (query.page ? Number(query.page) - 1 : 0) * esQuery.size

  // Select fields to return
  esQuery._source = { includes: query.select ? query.select.split(',') : ['*'], excludes: [] };

  // Some fields are excluded, unless explicitly included
  ['_geoshape', '_geopoint', '_geocorners', '_rand', '_i', '_file.content'].forEach(f => {
    if (!esQuery._source.includes.includes(f)) esQuery._source.excludes.push(f)
  })
  // Others are included depending on the context
  if (query.thumbnail) {
    const imageField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    if (imageField && query.select && !esQuery._source.includes.includes(imageField.key)) {
      esQuery._source.includes.push(imageField.key)
    }
  }

  // Sort by list of fields (prefixed by - for descending sort)
  esQuery.sort = exports.parseSort(query.sort)
  // Also implicitly sort by score
  esQuery.sort.push('_score')
  // And lastly random order for natural distribution (mostly important for geo results)
  esQuery.sort.push('_rand')

  // Simple highlight management
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-highlighting.html
  if (query.highlight) {
    esQuery.highlight = { fields: {}, no_match_size: 300, fragment_size: 100, pre_tags: ['<em class="highlighted">'], post_tags: ['</em>'] }
    query.highlight.split(',').forEach(key => {
      esQuery.highlight.fields[key + '.text'] = {}
    })
  }

  const filter = []
  const must = []

  // query and simple query string for a lot of functionalities in a simple exposition (too open ??)
  if (query.qs) {
    must.push({ query_string: { query: query.qs } })
  }
  if (query.q) {
    must.push({ simple_query_string: { query: query.q } })
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
