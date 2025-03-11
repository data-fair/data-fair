// @ts-nocheck
import { flatten } from 'flat'
import { strict as assert } from 'node:assert'
import clone from '@data-fair/lib-utils/clone.js'

const makeLongString = () => {
  let result = ''
  for (let i = 0; i < 100; i++) {
    result += Math.random()
  }
  return result
}

// use these to create some objects with some randomness and some hmogeneity
const nb1 = Math.random()
const nb2 = Math.random()
const str1 = makeLongString()
const str2 = makeLongString()

const makeObject = () => ({
  aaaaaaaaaaaaa: nb1,
  bbbbbbbbbbbbb: Math.random() + '',
  ccccccccccccc: Math.random() + '',
  ddddddddddddd: Math.random() + '',
  eeeeeeeeeeeee: Math.random() + '',
  fffffffffffff: nb2,
  ggggggggggggg: str1,
  hhhhhhhhhhhhh: str1,
  iiiiiiiiiiiii: nb1,
  jjjjjjjjjjjjj: makeLongString(),
  kkkkkkkkkkkkk: nb2,
  lllllllllllll: Math.random(),
  mmmmmmmmmmmmm: {
    // aaaaa: Math.random() + '',
    // bbbbb: nb1,
    ccccc: str1,
  },
  nnnnnnnnnnnnn: makeLongString(),
  ooooooooooooo: nb1,
  ppppppppppppp: nb2,
  qqqqqqqqqqqqq: Math.random(),
  /* rrrrrrrrrrrrr: {
    aaaaa: Math.random(),
    bbbbb: Math.random(),
    ccccc: Math.random() + '',
    ddddd: {
      aaaa: Math.random(),
      bbbb: Math.random(),
      cccc: makeLongString(),
    }
  }, */
  sssssssssssss: str1,
  ttttttttttttt: str2,
  uuuuuuuuuuuuu: str1,
  vvvvvvvvvvvvv: makeLongString(),
  wwwwwwwwwwwww: nb1,
  xxxxxxxxxxxxxx: nb2,
  yyyyyyyyyyyyy: Math.random(),
})

const makeObjects = () => {
  const results = []
  for (let i = 0; i < 100000; i++) {
    results.push(makeObject())
  }
  return results
}

const example = makeObject()
const flatExample = flatten(example)
const knownFlatKeys = []
const knownDeepKeys = []
for (const key in flatExample) {
  const parts = key.split('.')
  if (parts.length > 1) {
    knownFlatKeys.push(parts)
    if (!knownDeepKeys.includes(parts[0])) {
      knownDeepKeys.push(parts[0])
    }
  }
}

const flattenInPlace = (o) => {
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'object') {
      flattenInPlace(o[k])
      for (const kk of Object.keys(o[k])) {
        o[`${k}.${kk}`] = o[k][kk]
      }
      delete o[k]
    }
  }
  return o
}

const flattenInPlace2 = (o) => {
  for (const key of knownFlatKeys) {
    let value = o
    for (const k of key) {
      value = value[k]
    }
    o[key.join('.')] = value
  }
  for (const key of knownDeepKeys) {
    delete o[key]
  }
  return o
}

let jitCode = ''
for (const key of knownFlatKeys) {
  jitCode += `o[${JSON.stringify(key.join('.'))}] = o[${JSON.stringify(key.join('.'))}] ?? o[${key.map(k => JSON.stringify(k)).join(']?.[')}]\n`
}
for (const key of knownDeepKeys) {
  jitCode += `delete o[${JSON.stringify(key)}]\n`
}
jitCode += 'return o'

// eslint-disable-next-line no-new-func
const flattenInPlace3 = new Function('o', jitCode)
const identity = (o) => o

// checks that all methods work the same
const flat = flatten(clone(example))
const flatInPlace = flattenInPlace(clone(example))
assert.deepEqual(flat, flatInPlace)
const flatInPlace2 = flattenInPlace2(clone(example))
assert.deepEqual(flat, flatInPlace2)
const flatInPlace3 = flattenInPlace3(clone(example))
assert.deepEqual(flat, flatInPlace3)

// preuse all methods to avoid JIT compilation time
for (let i = 0; i < 1000; i++) {
  identity(makeObject())
  flatten(makeObject())
  flattenInPlace(makeObject())
  flattenInPlace2(makeObject())
  flattenInPlace3(makeObject())
}

const testMethod = (name, method) => {
  console.log(name)
  // eslint-disable-next-line no-undef
  gc()
  const objects = makeObjects()
  const memUsage1 = process.memoryUsage()
  const t = Date.now()
  const results = objects.map(method)
  const memUsage2 = process.memoryUsage()
  // gc()
  console.log(`time: ${Date.now() - t}\trss: ${(memUsage2.rss - memUsage1.rss).toLocaleString()}\theapTotal: ${(memUsage2.heapTotal - memUsage1.heapTotal).toLocaleString()}\theapUsed: ${(memUsage2.heapUsed - memUsage1.heapUsed).toLocaleString()}`)
  return results
}

// testMethod('using identity function', identity)
testMethod('using npm "flat" module', flatten)
// testMethod('using custom flattenInPlace function', flattenInPlace)
// testMethod('using custom flattenInPlace2 function with known keys', flattenInPlace2)
// testMethod('using custom flattenInPlace3 function with JIT code', flattenInPlace3)
