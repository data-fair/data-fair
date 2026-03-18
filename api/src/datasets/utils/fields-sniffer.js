import config from '#config'
import { sniff as _sniff, format as _format, escapeKey } from './operations.ts'

export { escapeKey }

export const sniff = (values, attachmentsPaths, existingField) =>
  _sniff(values, attachmentsPaths, existingField, { dateTimeFormats: config.dateTimeFormats, dateFormats: config.dateFormats })

export const format = (value, prop, fileProp, ignoreSeparator) =>
  _format(value, prop, fileProp, ignoreSeparator, { defaultTimeZone: config.defaultTimeZone })
