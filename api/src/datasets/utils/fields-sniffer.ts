import config from '#config'
import { sniff as _sniff, sniffDeclared as _sniffDeclared, format as _format, escapeKey } from './operations.ts'

export { escapeKey }

export const sniff = (values: string[], attachmentsPaths: string[], existingField: any) =>
  _sniff(values, attachmentsPaths, existingField, { dateTimeFormats: config.dateTimeFormats, dateFormats: config.dateFormats })

export const sniffDeclared = (values: string[], attachmentsPaths: string[], declared: any) =>
  _sniffDeclared(values, attachmentsPaths, declared, { dateTimeFormats: config.dateTimeFormats, dateFormats: config.dateFormats })

export const format = (value: string, prop: any, fileProp?: any, ignoreSeparator?: boolean) =>
  _format(value, prop, fileProp, ignoreSeparator, { defaultTimeZone: config.defaultTimeZone })
