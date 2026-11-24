/* eslint-disable no-new-func */
// flatten is used extensively in the API
// for this reason we tried to optimize it as much as possible
// we compile a function to prevent looping on keys and we memoize the function to avoid recompiling it every time

import type { DatasetLine } from '#types'
import memoize from 'memoizee'

// schema strings (keys, separators, fillNull keys) may hold any character: always quote them for the
// generated source, JSON.stringify yields a valid JS string literal for any string
const lit = (s: string) => JSON.stringify(String(s))

// the statements applied to a line: nested keys (extension sub-objects) moved to flat keys, separator
// arrays joined, fillNull keys defaulted. Empty when the schema needs none of it, i.e. flatten is the identity
const flattenStatements = (preserveArrays: boolean, fillNull: string, dataset: any): string => {
  let jitCode = ''
  const nestedKeys: string[] = []
  const fillNullArr = fillNull.split(',').filter(Boolean)
  for (const prop of dataset.schema) {
    const key = prop.key.split('.')
    const flatKey = lit(prop.key)
    if (key.length > 1) {
      const deepKey = key.map(lit).join(']?.[')

      jitCode += `if (o[${flatKey}] === undefined) {\n`
      if (key.length > 2) {
        const level1Key = lit(key.slice(1, key.length).join('.'))
        jitCode += `  if (o[${lit(key[0])}]?.[${level1Key}] !== undefined) { o[${flatKey}] = o[${lit(key[0])}][${level1Key}]; }\n`
        jitCode += `  else if (o[${deepKey}] !== undefined) { o[${flatKey}] = o[${deepKey}]; }\n`
      } else {
        jitCode += `  if (o[${deepKey}] !== undefined) { o[${flatKey}] = o[${deepKey}]; }\n`
      }
      jitCode += '}\n'
      if (!nestedKeys.includes(key[0])) {
        nestedKeys.push(key[0])
      }
    }
    if (prop.separator && !preserveArrays) {
      jitCode += `if (Array.isArray(o[${flatKey}])) { o[${flatKey}] = o[${flatKey}].join(${lit(prop.separator)}); }\n`
    }
  }
  for (const nestedKey of nestedKeys) {
    jitCode += `delete o[${lit(nestedKey)}];\n`
  }
  for (const fillNullKey of fillNullArr) {
    jitCode += `if (o[${lit(fillNullKey)}] === undefined) { o[${lit(fillNullKey)}] = null }\n`
  }
  return jitCode
}

const compileFlatten = (datasetId: string, finalizedAt: string, preserveArrays: boolean, fillNull: string, dataset: any): (line: any) => DatasetLine => {
  // @ts-ignore
  return new Function('o', flattenStatements(preserveArrays, fillNull, dataset) + 'return o;')
}

const memoizedCompileFlatten = memoize(compileFlatten, {
  profileName: 'flatten',
  max: 10000,
  maxAge: 1000 * 60 * 60, // 1 hour
  primitive: true,
  length: 4, // datasetId/finalizedAt/preserveArrays/fillNull are the keys
})

export const getFlatten = (dataset: any, preserveArrays: boolean = false, fillNull: string[] = []) => {
  return memoizedCompileFlatten(dataset.id, dataset.finalizedAt, preserveArrays, fillNull.join(','), dataset)
}

export const getFlattenNoCache = (dataset: any, preserveArrays: boolean = false, fillNull: string[] = []) => {
  return compileFlatten(dataset.id, dataset.finalizedAt, preserveArrays, fillNull.join(','), dataset)
}

// true when flatten(line) would return the line unchanged (no nested key, no separator column to join, no
// fillNull), letting callers that must not mutate their input skip the flatten and the copy it requires
export const isFlattenIdentity = (dataset: any, preserveArrays: boolean = false, fillNull: string[] = []) => {
  return flattenStatements(preserveArrays, fillNull.join(','), dataset) === ''
}
