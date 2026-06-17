import config from '#config'
import { sniff as _sniff, format as _format, escapeKey } from './operations.ts'

export { escapeKey }

export const sniff = (values: string[], attachmentsPaths: string[], existingField: any) =>
  _sniff(values, attachmentsPaths, existingField, { dateTimeFormats: config.dateTimeFormats, dateFormats: config.dateFormats })

export const format = (value: string, prop: any, fileProp: any, ignoreSeparator: boolean | undefined) =>
  _format(value, prop, fileProp, ignoreSeparator, { defaultTimeZone: config.defaultTimeZone })
