const { Readable, Transform, Writable } = require('stream')
const createError = require('http-errors')
const mimeTypeStream = require('mime-type-stream')
const flatten = require('flat')
const virtualDatasetsUtils = require('./virtual-datasets')
const batchStream = require('./batch-stream')
const esUtils = require('./es')
const prometheus = require('./prometheus')
const pump = require('./pipe')

exports.bulkSearchPromise = async (streams, data) => {
  const buffers = []
  await pump(
    Readable.from([data]),
    ...streams,
    new Writable({
      write (chunk, encoding, callback) {
        buffers.push(chunk)
        callback()
      }
    })
  )
  return Buffer.concat(buffers).toString()
}

exports.bulkSearchStreams = async (db, es, dataset, contentType, bulkSearchId, select) => {
  const bulkSearch = dataset.masterData && dataset.masterData.bulkSearchs && dataset.masterData.bulkSearchs.find(bs => bs.id === bulkSearchId)
  if (!bulkSearch) throw createError(404, `Recherche en masse "${bulkSearchId}" inconnue`)

  if (dataset.isVirtual) dataset.descendants = await virtualDatasetsUtils.descendants(db, dataset)
  const _source = (select && select !== '*') ? select.split(',') : dataset.schema.filter(prop => !prop['x-calculated']).map(prop => prop.key)
  const unknownField = _source.find(s => !dataset.schema.find(p => p.key === s))
  if (unknownField) throw createError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données.`)

  const finalizeResponseLine = (responseLine, lineKey, error) => {
    responseLine = flatten(responseLine)
    const fixedLine = {}
    for (const id of _source) {
      if (id in responseLine) {
        fixedLine[id] = responseLine[id]
      } else if (contentType === 'text/csv') {
        fixedLine[id] = '' // complete csv output with empty values so that the generated header is complete
      }
    }
    fixedLine._key = lineKey
    if (error) fixedLine._error = error
    else if (contentType === 'text/csv') fixedLine._error = ''
    return fixedLine
  }

  // this function will be called for each input line of the bulk search stream
  const paramsBuilder = (line) => {
    const params = {}
    const qs = []
    for (const input of bulkSearch.input) {
      if ([null, undefined].includes(line[input.property.key])) {
        throw createError(400, `la propriété en entrée ${input.property.key} est obligatoire`)
      }
      if (input.type === 'equals') {
        qs.push(`${esUtils.escapeFilter(input.property.key)}:"${esUtils.escapeFilter(line[input.property.key])}"`)
      } else if (input.type === 'date-in-interval') {
        const startDate = dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/startDate')
        const endDate = dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/endDate')
        if (!startDate || !endDate) throw new Error('cet enrichissement sur interval de date requiert les concepts "date de début" et "date de fin"')
        const date = line[input.property.key].replace(/:/g, '\\:')
        qs.push(`${endDate.key}:[${date} TO *]`)
        qs.push(`${startDate.key}:[* TO ${date}]`)
      } else if (input.type === 'geo-distance') {
        const [lat, lon] = line[input.property.key].split(',')
        params.geo_distance = `${lon},${lat},${input.distance}`
      } else {
        throw createError(400, `input type ${input.type} is not supported`)
      }
    }
    if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')

    return params
  }

  const ioStream = mimeTypeStream(contentType) || mimeTypeStream('application/json')

  let lineIndex = 0
  return [
    ioStream.parser(),
    batchStream(1000),
    new Transform({
      async transform (lines, encoding, callback) {
        try {
          const queries = lines.map(line => ({
            select,
            sort: bulkSearch.sort,
            ...paramsBuilder(line),
            size: 1
          }))
          let esResponse
          try {
            esResponse = await esUtils.multiSearch(es, dataset, queries)
          } catch (err) {
            prometheus.internalError.inc({ errorCode: 'masterdata-multi-query' })
            console.error(`(masterdata-multi-query) master-data multisearch query error ${dataset.id}`, err)
            const message = esUtils.errorMessage(err)
            throw createError(err.status, message)
          }
          for (const i in esResponse.responses) {
            const line = lines[i]
            const lineKey = line._key || lineIndex
            lineIndex += 1
            const response = esResponse.responses[i]

            if (response.error) {
              prometheus.internalError.inc({ errorCode: 'masterdata-item-query' })
              console.error(`(masterdata-item-query) master-data item query error ${dataset.id}`, response.error)
              this.push(finalizeResponseLine({}, lineKey, esUtils.errorMessage(response.error)))
              continue
            }
            if (response.hits.hits.length === 0) {
              this.push(finalizeResponseLine({}, lineKey, 'La donnée de référence ne contient pas de ligne correspondante.'))
              continue
            }
            this.push(finalizeResponseLine(response.hits.hits[0]._source, lineKey))
          }
          callback()
        } catch (err) {
          callback(err)
        }
      },
      objectMode: true
    }),
    ioStream.serializer()
  ]
}
