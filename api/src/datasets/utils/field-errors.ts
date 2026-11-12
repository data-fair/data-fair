import capabilities from '../../../contract/capabilities.js'
import { i18nHttpError, i18nMessage, locales, type I18nParams } from '../../misc/utils/i18n-errors.ts'
import { getColumnOperations } from '../es/operations.ts'

// the errors of a query on a dataset field, repeated by every query builder (es, ods compat...)

// what the query tried to do with the field, filterOperator takes an { operator } parameter
export type FieldAction = 'filter' | 'filterOperator' | 'sort' | 'group' | 'metric' | 'search' | 'select' | 'aggregate' | 'highlight' | 'collapse'

// a message in every locale, to be a parameter of another message
export const localized = (key: string, params: I18nParams = {}) =>
  Object.fromEntries(locales.map(locale => [locale, i18nMessage(key, params, locale)])) as { en: string, fr?: string }

// "cannot <action> on field <field>", the start of a message about the field (key errors.fields.action.*)
export const fieldAction = (name: FieldAction, field: string, params: I18nParams = {}) => localized(`errors.fields.action.${name}`, { ...params, field })

const capabilityTitle = (key: string) => {
  const prop = (capabilities.properties as Record<string, any>)[key]
  return { en: prop?.title ?? key, fr: prop?.['x-i18n-title']?.fr ?? prop?.title ?? key }
}

/**
 * What a column supports, appended to a capability error so that the caller (often an agent) can self-correct.
 * NOTE: allocates — call only on error paths.
 */
export const columnOperationsHint = (prop: any) => {
  const ops = getColumnOperations(prop)
  return Object.fromEntries(locales.map(locale => {
    const yesNo = (value: boolean) => i18nMessage(value ? 'errors.fields.yes' : 'errors.fields.no', {}, locale)
    return [locale, i18nMessage('errors.fields.operationsHint', {
      filters: ops.filters.length ? ops.filters.join(', ') : i18nMessage('errors.fields.none', {}, locale),
      sortable: yesNo(ops.sortable),
      groupable: yesNo(ops.groupable)
    }, locale)]
  })) as { en: string, fr?: string }
}

export const unknownFieldError = (name: FieldAction, field: string) =>
  i18nHttpError(400, 'errors.fields.unknown', { action: fieldAction(name, field) })

// a capability of the field is disabled in its technical configuration, prop adds the hint of what the field supports
export const missingCapabilityError = (name: FieldAction, field: string, capability: string, prop?: any, actionParams: I18nParams = {}) =>
  i18nHttpError(400, 'errors.fields.missingCapability', {
    action: fieldAction(name, field, actionParams),
    capability: capabilityTitle(capability),
    hint: prop ? columnOperationsHint(prop) : ''
  })

// an error of a worker input that must not be retried: the English message (the one a worker stores) keeps the
// [noretry] prefix read by the worker loop, the translated message of a request does not
export const noRetryError = (status: number, key: string, params: I18nParams = {}) => {
  const err = i18nHttpError(status, key, params)
  err.message = '[noretry] ' + err.message
  return err
}
