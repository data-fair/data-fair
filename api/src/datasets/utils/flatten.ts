/* eslint-disable no-new-func */
// flatten is used extensively in the API
// for this reason we tried to optimize it as much as possible
// we compile a function to prevent looping on keys and we memoize the function to avoid recompiling it every time

// TODO: would it be safer to use a code generator, for example https://www.npmjs.com/package/astring ?

import type { DatasetLine } from '#types'
import memoize from 'memoizee'

const compileFlatten = (datasetId: string, finalizedAt: string, preserveArrays: boolean, fillNull: string, dataset: any): (line: any) => DatasetLine => {
  let jitCode = ''
  const nestedKeys: string[] = []
  const fillNullArr = fillNull.split(',').filter(Boolean)
  for (const prop of dataset.schema) {
    const key = prop.key.split('.')
    if (key.length > 1) {
      const flatKey = `"${prop.key}"`
      const deepKey = key.map((k: string) => `"${k}"`).join(']?.[')

      jitCode += `if (o[${flatKey}] === undefined) {\n`
      if (key.length > 2) {
        const level1Key = `"${key.slice(1, key.length).join('.')}"`
        jitCode += `  if (o["${key[0]}"]?.[${level1Key}] !== undefined) { o[${flatKey}] = o["${key[0]}"][${level1Key}]; }\n`
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
      jitCode += `if (Array.isArray(o["${prop.key}"])) { o["${prop.key}"] = o["${prop.key}"].join("${prop.separator}"); }\n`
    }
  }
  for (const nestedKey of nestedKeys) {
    jitCode += `delete o["${nestedKey}"];\n`
  }
  for (const fillNullKey of fillNullArr) {
    jitCode += `if (o["${fillNullKey}"] === undefined) { o["${fillNullKey}"] = null }\n`
  }
  jitCode += 'return o;'

  // @ts-ignore
  return new Function('o', jitCode)
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
