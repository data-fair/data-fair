const { Readable, Transform, Writable } = require('stream')
const createError = require('http-errors')
const mimeTypeStream = require('mime-type-stream')
const virtualDatasetsUtils = require('./virtual-datasets')
const batchStream = require('./batch-stream')
const esUtils = require('./es')
const pump = require('util').promisify(require('pump'))

exports.bulkSearchPromise = async (streams, data) => {
  const buffers = []
  await pump(
    Readable.from([data]),
    ...streams,
    new Writable({
      write(chunk, encoding, callback) {
        buffers.push(chunk)
        callback()
      },
    }),
  )
  return Buffer.concat(buffers).toString()
}

exports.bulkSearchStreams = async (db, es, dataset, contentType, bulkSearchId, select) => {
  const bulkSearch = dataset.masterData && dataset.masterData.bulkSearchs && dataset.masterData.bulkSearchs.find(bs => bs.id === bulkSearchId)
  if (!bulkSearch) throw createError(404, `Recherche en masse "${bulkSearchId}" inconnue`)

  if (dataset.isVirtual) dataset.descendants = await virtualDatasetsUtils.descendants(db, dataset)

  // this function will be called for each input line of the bulk search stream
  const paramsBuilder = (line) => {
    const params = {}
    const qs = []
    bulkSearch.input.forEach(input => {
      if ([null, undefined].includes(line[input.property.key])) {
        throw createError(400, `la propriété en entrée ${input.property.key} est obligatoire`)
      }
      if (input.type === 'equals') {
        qs.push(`${input.property.key}:"${line[input.property.key]}"`)
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
    })
    if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')

    return params
  }

  const ioStream = mimeTypeStream(contentType) || mimeTypeStream('application/json')

  let lineIndex = 0
  return [
    ioStream.parser(),
    batchStream(1000),
    new Transform({
      async transform(lines, encoding, callback) {
        const queries = lines.map(line => ({
          select,
            sort: bulkSearch.sort,
            ...paramsBuilder(line),
            size: 1,
        }))
        let esResponse
        try {
          esResponse = await esUtils.multiSearch(es, dataset, queries)
        } catch (err) {
          console.error(`master-data multisearch query error ${dataset.id}`, err)
          const message = esUtils.errorMessage(err)
          return callback(createError(err.status, message))
        }
        for (const i in esResponse.responses) {
          const line = lines[i]
          const lineKey = line._key || lineIndex
          lineIndex += 1
          const response = esResponse.responses[i]

          if (response.error) {
            console.error(`master-data item query error ${dataset.id}`, response.error)
            this.push({ _key: lineKey, _error: esUtils.errorMessage(response.error) })
            continue
          }
          if (response.hits.hits.length === 0) {
            this.push({ _key: lineKey, _error: 'La donnée de référence ne contient pas de ligne correspondante.' })
            continue
          }
          const responseLine = response.hits.hits[0]._source
          Object.keys(responseLine).forEach(k => {
            if (k.startsWith('_')) delete responseLine[k]
          })
          this.push({ ...responseLine, _key: lineKey })
        }
        callback()
      },
      objectMode: true,
    }),
    ioStream.serializer(),
  ]
}
