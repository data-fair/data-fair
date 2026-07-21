import * as journals from '../../misc/utils/journals.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import iconv from 'iconv-lite'
import * as csvSniffer from '../../misc/utils/csv-sniffer.ts'
import * as datasetUtils from '../../datasets/utils/index.ts'
import { updateStorage } from '../../datasets/utils/storage.ts'
import * as datasetsService from '../../datasets/service.ts'
import * as fieldsSniffer from '../../datasets/utils/fields-sniffer.ts'
import { sampleValues as getSampleValues } from '../../datasets/utils/data-streams.ts'
import outOfCharacter from 'out-of-character'
import debugLib from 'debug'
import type { Event, FileDataset } from '#types'
import filesStorage from '#files-storage'

// Analyze dataset data, check validity and extract a few metadata for next workers

export default async function (dataset: FileDataset) {
  const debug = debugLib(`worker:csv-analyzer:${dataset.id}`)

  debug('extract file sample')
  const fileSample = await filesStorage.fileSample(datasetUtils.filePath(dataset))
  if (!fileSample) throw httpError(400, '[noretry] Échec d\'échantillonnage du fichier tabulaire, il est vide')
  let decodedSample
  try {
    decodedSample = (dataset.file.encoding === 'UTF-8' || !dataset.file.encoding)
      ? fileSample.toString()
      : iconv.decode(fileSample, dataset.file.encoding)
  } catch (err) {
    throw httpError(400, `[noretry] Échec de décodage du fichier selon l'encodage détecté ${dataset.file.encoding}`)
  }
  decodedSample = outOfCharacter.replace(decodedSample)

  debug('sniff csv sample')
  const sniffResult = await csvSniffer.sniff(decodedSample)

  dataset.file.schema = sniffResult.labels
    .map((field, i) => ({
      key: fieldsSniffer.escapeKey(field, dataset?.analysis?.escapeKeyAlgorithm),
      'x-originalName': field.replace(/""/g, '"').replace(/^"/, '').replace(/"$/, '')
    }))
    // do not keep columns with empty string as header
    .filter(field => !!field.key)

  const keys = new Set<string>([])
  for (const field of dataset.file.schema) {
    if (keys.has(field.key)) throw httpError(400, `[noretry] Échec de l'analyse du fichier tabulaire, il contient plusieurs fois la colonne "${field.key}".`)
    keys.add(field.key)
  }

  dataset.file.props = {
    linesDelimiter: sniffResult.linesDelimiter,
    fieldsDelimiter: sniffResult.fieldsDelimiter,
    escapeChar: sniffResult.escapeChar,
    quote: sniffResult.quote
  }

  // get a random sampling to test values type on fewer elements
  debug('extract dataset sample')
  const sampleValues = await getSampleValues(dataset)
  debug('list attachments')
  // Now we can extract infos for each field
  const attachments = await datasetUtils.lsAttachments(dataset)
  debug('sniff sample values')
  for (const field of Object.keys(sampleValues)) {
    if (!field) continue // do not keep columns with empty string as header
    const escapedKey = fieldsSniffer.escapeKey(field, dataset?.analysis?.escapeKeyAlgorithm)
    const fileField = dataset.file.schema.find(f => f.key === escapedKey)
    if (fileField) {
      const existingField = dataset.schema && dataset.schema.find(f => f.key === escapedKey)
      Object.assign(fileField, fieldsSniffer.sniff([...sampleValues[field]], attachments, existingField))
    } else {
      if (sampleValues[field].size) {
        throw httpError(400, `[noretry] Champ ${field} présent dans la donnée mais absent de l'analyse initiale du fichier`)
      }
    }
  }
  // the concept counts whether auto-detected on this analysis (file.schema) or manually
  // designated on a previous cycle (schema, kept across re-analysis) — otherwise the
  // warning would re-appear on every re-upload of an already-designated dataset.
  const hasDocumentConcept = dataset.file.schema.some(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument') ||
    !!dataset.schema?.some(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (attachments.length && !hasDocumentConcept) {
    // non-blocking: attachments are dropped at finalize; the message tells the user to
    // designate the column before re-uploading (re-uploading first would just drop them again).
    await journals.log('datasets', dataset, {
      type: 'error',
      data: `Des pièces jointes ont été chargées mais aucune colonne n'a pu être associée automatiquement aux fichiers ; elles n'ont donc pas été conservées. Attribuez le concept « Document Numérique Attaché » à la colonne contenant les chemins vers les pièces jointes, puis rechargez les pièces jointes. Exemples de fichiers attendus : ${attachments.slice(0, 3).join(', ')}.`
    } as Event)
  }
  const emptyCols = dataset.file.schema.filter(p => p.type === 'empty')
  if (emptyCols.length) {
    const errorMessage = `le fichier contient une ou plusieurs colonnes vides qui seront ignorées : ${emptyCols.map(c => c['x-originalName'] || c.key).join(', ')}`
    await journals.log('datasets', dataset, {
      type: 'error',
      data: errorMessage
    } as Event)
  }
  debug('apply detected schema')
  dataset.file.schema = dataset.file.schema.filter(p => p.type !== 'empty')
  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  const patch = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }

  await datasetsService.applyPatch(dataset, patch)
  if (!dataset.draftReason) await updateStorage(dataset, { checkRemaining: true, esUnavailable: true })
}
