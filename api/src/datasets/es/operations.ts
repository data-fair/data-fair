import { httpError } from '@data-fair/lib-utils/http-errors.js'
import capabilities from '../../../contract/capabilities.js'

export interface ExtractedError {
  message: string
  status: number
}

/**
 * Check if a property has a given capability
 */
export const hasCapability = (prop: any, capability: string = 'index'): boolean => {
  const propCapabilities = prop['x-capabilities'] ?? {}
  if (propCapabilities[capability] === false || (['wildcard', 'textAgg'].includes(capability) && propCapabilities[capability] !== true)) {
    return false
  }
  return true
}

/**
 * Require a capability on a property, throwing an HTTP error if not present
 */
export const requiredCapability = (prop: any, filterName: string, capability: string = 'index'): void => {
  if (!hasCapability(prop, capability)) {
    throw httpError(400, `Impossible d'appliquer un filtre ${filterName} sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties[capability]?.title}" n'est pas activée dans la configuration technique du champ.`)
  }
}

/**
 * Try to produce a somewhat readable error message from a structured error from elasticsearch
 */
export const extractError = (err: any): ExtractedError => {
  const status = err.status ?? err.statusCode ?? 500
  if (typeof err === 'string') return { message: err, status }
  let errBody = (err.body && err.body.error) || (err.meta && err.meta.body && err.meta.body.error) || err.error
  if (!errBody && !!err.reason) errBody = err
  if (!errBody) {
    if (err.message) return { message: err.message, status }
    else return { message: JSON.stringify(err), status }
  }
  const parts: string[] = []
  if (errBody.reason) {
    parts.push(errBody.reason)
  }
  if (errBody.root_cause?.reason && !parts.includes(errBody.root_cause.reason)) {
    parts.push(errBody.root_cause.reason)
  }
  if (errBody.caused_by?.reason && !parts.includes(errBody.caused_by.reason)) {
    parts.push(errBody.caused_by.reason)
  }
  if (errBody.root_cause?.[0]?.reason && !parts.includes(errBody.root_cause[0].reason)) {
    parts.push(errBody.root_cause[0].reason)
  }
  if (errBody.failed_shards?.[0]?.reason) {
    const shardReason = errBody.failed_shards[0].reason
    if (shardReason.caused_by?.reason && !parts.includes(shardReason.caused_by.reason)) {
      parts.push(shardReason.caused_by.reason)
    } else {
      const reason = shardReason.reason || shardReason
      if (!parts.includes(reason)) parts.push(reason)
    }
  }
  if (parts.includes('Time exceeded')) {
    return {
      message: 'Cette requête est trop longue, son traitement a été interrompu.',
      status: 504
    }
  }
  return { message: parts.join(' - '), status }
}

/**
 * Escape special Lucene query characters in a filter value
 * cf https://github.com/joeybaker/lucene-escape-query/blob/master/index.js
 */
export const escapeFilter = (val: any): any => {
  if (typeof val !== 'string') return val
  return [].map.call(val, (char: string) => {
    if (char === '+' ||
      char === '-' ||
      char === '&' ||
      char === '|' ||
      char === '!' ||
      char === '(' ||
      char === ')' ||
      char === '{' ||
      char === '}' ||
      char === '[' ||
      char === ']' ||
      char === '^' ||
      char === '"' ||
      char === '~' ||
      char === '*' ||
      char === '?' ||
      char === ':' ||
      char === '\\' ||
      char === '/'
    ) return '\\' + char
    else return char
  }).join('')
}
