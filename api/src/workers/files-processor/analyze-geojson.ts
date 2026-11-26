import { httpError } from '@data-fair/lib-utils/http-errors.js'
import * as datasetUtils from '../../datasets/utils/index.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetsService from '../../datasets/service.ts'
import * as fieldsSniffer from '../../datasets/utils/fields-sniffer.ts'
import projections from '../../../contract/projections.js'
import { sampleValues as getSampleValues } from '../../datasets/utils/data-streams.ts'
import { createFeatureVertexCounter, MAX_FEATURE_VERTICES } from '../../datasets/utils/geojson-feature-size.ts'
import { createJsonStreamScanner } from '../../datasets/utils/json-streams.ts'
import type { DatasetInternal, FileDataset, SchemaProperty } from '#types'

// Analyze geojson dataset data, check validity and detect schema
export const eventsPrefix = 'analyze'

export default async function (dataset: FileDataset) {
  const attachments = await datasetUtils.lsAttachments(dataset)

  // the stream is mainly read to get the features, but we also support extracting the crs property if it is present
  const crsScanner = createJsonStreamScanner({ rootKeys: ['crs'] })
  let crsError = false

  const schema: SchemaProperty[] = [{
    type: 'string',
    key: 'geometry',
    'x-originalName': 'geometry',
    'x-refersTo': 'https://purl.org/geojson/vocab#geometry'
  }]
  // checked on the text, before the feature parser holds an oversized feature in memory
  const vertexCounter = createFeatureVertexCounter(MAX_FEATURE_VERTICES)
  const sampleValues = await getSampleValues(dataset, ['geometry'], (decodedData: any) => {
    const oversized = vertexCounter.write(decodedData)
    if (oversized) {
      throw httpError(400, `[noretry] The feature n°${oversized.index + 1} of the file has more than ${MAX_FEATURE_VERTICES.toLocaleString('en')} vertices, it is too large to be processed. Split it into smaller features (for example one feature per polygon of a multipolygon, with "ogr2ogr -explodecollections") or simplify it before loading the file.`)
    }
    if (!crsError) {
      try {
        crsScanner.write(typeof decodedData === 'string' ? Buffer.from(decodedData) : decodedData)
      } catch {
        // ignore invalid json errors at this stage, it will be handled later
        crsError = true
      }
    }
  })
  const crs: any = crsScanner.rootValues.crs

  // keep track of the original name behind each key to detect collisions
  // (e.g. properties "ID" and "id" both escape to "id")
  const originalNamesByKey = new Map<string, string>([['geometry', 'geometry']])
  for (const property in sampleValues) {
    const key = fieldsSniffer.escapeKey(property, dataset?.analysis?.escapeKeyAlgorithm)
    const existingField = dataset.schema?.find(f => f.key === key)
    const field = {
      key,
      'x-originalName': property,
      ...fieldsSniffer.sniff([...sampleValues[property]], attachments, existingField)
    }
    if (field.type === 'empty') continue
    const collidingName = originalNamesByKey.get(key)
    if (collidingName !== undefined) {
      throw httpError(400, `[noretry] Failed to analyze the file, the columns "${collidingName}" and "${property}" map to the same key "${key}".`)
    }
    originalNamesByKey.set(key, property)
    schema.push(field)
  }

  dataset.status = 'analyzed'
  dataset.file.schema = schema

  if (crs && crs.properties && crs.properties.name) {
    const code = crs.properties.name.replace('urn:ogc:def:crs:', '').replace('::', ':')
    const projection = projections.find(p => p.code === code || p.aliases.includes(code))
    if (!projection) throw httpError(400, `[noretry] The projection ${code} in the "crs" property of the geojson is not supported.`)
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
  if (!dataset.draftReason) await updateStorage(dataset, { checkRemaining: true, esUnavailable: true })
}
