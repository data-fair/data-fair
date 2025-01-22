import { Readable, Transform, Writable } from 'stream'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mimeTypeStream from 'mime-type-stream'
import { flatten } from 'flat'
import * as virtualDatasetsUtils from './virtual.js'
import batchStream from '../../misc/utils/batch-stream.js'
import * as esUtils from '../es/index.js'
import pump from '../../misc/utils/pipe.js'
import { internalError } from '@data-fair/lib-node/observer.js'

export const bulkSearchPromise = async (streams, data) => {
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

export const bulkSearchStreams = async (db, es, dataset, contentType, bulkSearchId, select) => {
  const bulkSearch = dataset.masterData && dataset.masterData.bulkSearchs && dataset.masterData.bulkSearchs.find(bs => bs.id === bulkSearchId)
  if (!bulkSearch) throw httpError(404, `Recherche en masse "${bulkSearchId}" inconnue`)

  if (dataset.isVirtual) dataset.descendants = await virtualDatasetsUtils.descendants(db, dataset, true)
  const _source = (select && select !== '*') ? select.split(',') : dataset.schema.filter(prop => !prop['x-calculated']).map(prop => prop.key)
  const unknownField = _source.find(s => !dataset.schema.find(p => p.key === s))
  if (unknownField) throw httpError(400, `Impossible de sélectionner le champ ${unknownField}, il n'existe pas dans le jeu de données.`)

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
    if (bulkSearch.filters) {
      for (const f of bulkSearch.filters) {
        if (f.property?.key && f.values?.length) {
          qs.push(f.values.map(value => `(${esUtils.escapeFilter(f.property.key)}:"${esUtils.escapeFilter(value)}")`).join(' OR '))
        }
      }
    }
    for (const input of bulkSearch.input) {
      if ([null, undefined].includes(line[input.property.key])) {
        throw httpError(400, `la propriété en entrée ${input.property.key} est obligatoire`)
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
        throw httpError(400, `input type ${input.type} is not supported`)
      }
    }
    if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')

    return params
  }

  const ioStream = mimeTypeStream(contentType) || mimeTypeStream('application/json')

  let lineIndex = 0
  return [
    ioStream.parser(),
    batchStream(200),
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
            internalError('masterdata-multi-query', err)
            const { message, status } = esUtils.extractError(err)
            throw httpError(status, message)
          }
          for (const i in esResponse.responses) {
            const line = lines[i]
            const lineKey = line._key || lineIndex
            lineIndex += 1
            const response = esResponse.responses[i]

            if (response.error) {
              internalError('masterdata-item-query', esUtils.extractError(response.error))
              this.push(finalizeResponseLine({}, lineKey, esUtils.extractError(response.error).message))
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
