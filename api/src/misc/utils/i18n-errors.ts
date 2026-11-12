import { I18n } from 'i18n'
import { join } from 'node:path'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Request, Response, NextFunction } from 'express'

// the catalogs of api/i18n/messages, read only: an error must be buildable anywhere (worker, unit test) without the api config
const i18n = new I18n({
  directory: join(import.meta.dirname, '../../../i18n/messages'),
  objectNotation: true,
  updateFiles: false,
  syncFiles: false
})
export const locales = i18n.getLocales()

// a parameter of a message: a plain value, or a value that depends on the locale (a field title, a hint...)
export type I18nParam = string | number | { en: string, fr?: string }
export type I18nParams = Record<string, I18nParam>

const resolveParams = (params: I18nParams, locale: string) => Object.fromEntries(Object.entries(params)
  .map(([key, value]) => [key, typeof value === 'object' ? (value[locale as 'en' | 'fr'] ?? value.en) : String(value)]))

export const i18nMessage = (key: string, params: I18nParams, locale: string): string =>
  i18n.__({ phrase: key, locale }, resolveParams(params, locale))

export type I18nHttpError = Error & { status: number, i18n: { key: string, params: I18nParams } }

/**
 * An http error whose message is a key of api/i18n/messages: the error carries the English message,
 * the translateErrors middleware replaces it with the message in the language of the request.
 * Thrown far from any request (a worker, a query builder), it keeps its English message.
 */
export const i18nHttpError = (status: number, key: string, params: I18nParams = {}): I18nHttpError =>
  Object.assign(httpError(status, i18nMessage(key, params, 'en')), { i18n: { key, params } })

// mounted just before the error handler
export const translateErrors = (err: any, req: Request, res: Response, next: NextFunction) => {
  const getLocale = (req as any).getLocale
  if (err?.i18n && typeof getLocale === 'function') {
    const locale = getLocale.call(req)
    // rendered for en too: the message built at throw time may carry an internal prefix ([noretry])
    if (locale) err.message = i18nMessage(err.i18n.key, err.i18n.params, locale)
  }
  next(err)
}
