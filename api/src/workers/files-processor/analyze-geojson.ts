import { httpError } from '@data-fair/lib-utils/http-errors.js'
import streamJsonParser from 'stream-json/Parser.js'
import streamJsonPick from 'stream-json/filters/Pick.js'
import streamValues from 'stream-json/streamers/StreamValues.js'
import * as datasetUtils from '../../datasets/utils/index.js'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetsService from '../../datasets/service.js'
import * as fieldsSniffer from '../../datasets/utils/fields-sniffer.js'
import projections from '../../../contract/projections.js'
import { sampleValues as getSampleValues } from '../../datasets/utils/data-streams.js'
import type { DatasetInternal, FileDataset, SchemaProperty } from '#types'

// Analyze geojson dataset data, check validity and detect schema
export const eventsPrefix = 'analyze'

export default async function (dataset: FileDataset) {
  const attachments = await datasetUtils.lsAttachments(dataset)

  // the stream is mainly read to get the features, but we also support extracting the crs property if it is present
  const crsParser = streamJsonParser.parser()
  crsParser.on('error', () => {
    // ignore invalid json errors at this stage, it will be handled later
  })
  const crsPipeline = crsParser
    .pipe(streamJsonPick.pick({ filter: 'crs' }))
    .pipe(streamValues.streamValues())
  let crs: any
  crsPipeline.on('data', (data) => {
    crs = data.value
  })

  const schema: SchemaProperty[] = [{
    type: 'string',
    key: 'geometry',
    'x-originalName': 'geometry',
    'x-refersTo': 'https://purl.org/geojson/vocab#geometry'
  }]
  const sampleValues = await getSampleValues(dataset, ['geometry'], (decodedData: any) => crsParser.write(decodedData))
  crsParser.end()

  for (const property in sampleValues) {
    const key = fieldsSniffer.escapeKey(property, dataset?.analysis?.escapeKeyAlgorithm)
    const existingField = dataset.schema?.find(f => f.key === key)
    const field = {
      key,
      'x-originalName': property,
      ...fieldsSniffer.sniff([...sampleValues[property]], attachments, existingField)
    }
    if (field.type !== 'empty') schema.push(field)
  }

  dataset.status = 'analyzed'
  dataset.file.schema = schema

  if (crs && crs.properties && crs.properties.name) {
    const code = crs.properties.name.replace('urn:ogc:def:crs:', '').replace('::', ':')
    const projection = projections.find(p => p.code === code || p.aliases.includes(code))
    if (!projection) throw httpError(400, `[noretry] La projection ${code} dans la propriété "crs" du geojson n'est pas supportée.`)
    dataset.projection = { code: projection.code, title: projection.title }
    dataset.file.schema[0]['x-refersTo'] = 'http://data.ign.fr/def/geometrie#Geometry'
  }

  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  const patch: Partial<DatasetInternal> = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }
  if (dataset.projection) patch.projection = dataset.projection

  await datasetsService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset, false, true)
}
