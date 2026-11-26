// the errors of the ODS compatibility layer that are not generic field errors (see datasets/utils/field-errors.ts),
// imported by the grammars (*.pegjs) and by operations.ts
import { i18nHttpError, i18nMessage, locales, type I18nParams } from '../../misc/utils/i18n-errors.ts'
import { KEYWORD_IGNORE_ABOVE } from '../../datasets/es/operations.ts'

// a message in every locale, to be a parameter of another message
const localized = (key: string, params: I18nParams = {}) =>
  Object.fromEntries(locales.map(locale => [locale, i18nMessage(key, params, locale)])) as { en: string, fr?: string }

// the message of an error caught to be wrapped in another one, translated if it is an i18n error
const errorParam = (err: any) => err?.i18n ? localized(err.i18n.key, err.i18n.params) : String(err?.message ?? err)

export type NumericMetric = 'avg' | 'sum' | 'median' | 'percentile'

// "cannot compute / sort on the <metric> of field <field>, it is not numeric"
export const notNumericError = (action: 'select' | 'sort', metric: NumericMetric, field: string) =>
  i18nHttpError(400, 'errors.ods.notNumeric', {
    action: localized(`errors.ods.metricAction.${action}`, { metric: localized(`errors.ods.metric.${metric}`), field })
  })

export const notDateError = (operation: string) => i18nHttpError(400, 'errors.ods.notDate', { operation })

export const valueTooLongError = (field: string) => i18nHttpError(400, 'errors.ods.valueTooLong', { field, max: KEYWORD_IGNORE_ABOVE })

export const invalidGeometryError = (geometry: string, err: any) => i18nHttpError(400, 'errors.ods.invalidGeometry', { geometry, error: errorParam(err) })

// a query parameter that could not be parsed, err is the error of the parser
export const invalidParamError = (param: string, err: any) => i18nHttpError(400, 'errors.ods.invalidParam', { param, error: errorParam(err) })
