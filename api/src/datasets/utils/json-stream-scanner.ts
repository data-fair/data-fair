import { Transform } from 'node:stream'
import Parser from 'jsonparse'

const OPEN_OBJECT = 123 // {
const CLOSE_OBJECT = 125 // }
const OPEN_ARRAY = 91 // [
const CLOSE_ARRAY = 93 // ]
const QUOTE = 34 // "
const BACKSLASH = 92 // \
const COLON = 58 // :
const COMMA = 44 // ,
const DOT = 46 // .
const PLUS = 43 // +
const MINUS = 45 // -
const LOWER_E = 101 // e
const UPPER_E = 69 // E
const ZERO = 48
const NINE = 57
const SPACE = 32
// digit-only numbers from this length may not fit a double exactly, jsonparse keeps them as strings
const LONG_INTEGER_DIGITS = 16

// jsonparse is the parser of JSONStream, that this scanner replaces. It reads the few values
// JSON.parse would read differently (invalid JSON it accepts, like 007, and long integers it keeps
// as strings), so that every value stays the same.
const jsonparse = (text: Buffer) => {
  const parser = new Parser()
  let value: any
  parser.onValue = function (this: { stack: unknown[] }, v: any) { if (this.stack.length === 0) value = v }
  parser.onError = (err: Error) => { throw err }
  parser.write(text)
  // a number is only closed by what follows it
  parser.write(Buffer.from(' '))
  return value
}

const parseValue = (text: Buffer, longInteger: boolean) => {
  if (longInteger) return jsonparse(text)
  try {
    return JSON.parse(text.toString())
  } catch {
    return jsonparse(text)
  }
}

const concat = (parts: Buffer[]) => parts.length === 1 ? parts[0] : Buffer.concat(parts)

export type JsonStreamScannerOptions = {
  // object keys from the root to the container whose children are read: ['features'] for a geojson
  // FeatureCollection, [] for the children of the root value (JSONStream paths 'features.*' and '*'),
  // none to read root values only
  path?: string[]
  // keys of the root object whose values are kept in rootValues (the crs of a geojson)
  rootKeys?: string[]
}

// Reads, from a JSON text fed in order and in chunks of any size, the children of the container at
// a path of object keys (elements of an array, values of an object), like JSONStream.parse(path + '.*')
// with null values skipped, at a fraction of its memory and time.
// It scans the bytes for structure characters only (strings and escapes, the nesting of { and [, the
// colons that separate keys from values) and keeps the bytes of the current child, handed to
// JSON.parse once it closes: the native parser builds it in one pass, where a parser written in
// javascript holds tokens and intermediary strings for each of its values (a geojson geometry can have
// hundreds of thousands of vertices). Utf-8 is scanned as bytes, multi-byte sequences never contain
// ascii bytes. Several root values one after the other are read like JSONStream does.
// Unlike JSONStream, the text out of the children read is not validated.
export const createJsonStreamScanner = ({ path, rootKeys = [] }: JsonStreamScannerOptions) => {
  const pathLength = path ? path.length : -1
  const stack: number[] = []
  let inString = false
  let escaped = false
  // in an object, a value is expected (after its colon) rather than a key
  let afterColon = false
  // the containers of the stack after the root that match the first keys of path
  let matched = 0
  // key being read and the last key read, in an object of the matched containers
  let keyParts: Buffer[] | null = null
  let keyStart = -1
  let lastKey: string | null = null
  // value being kept: bytes from previous chunks, start in the current chunk, depth of its container,
  // what closes it, root key it belongs to (undefined for a child of path)
  let parts: Buffer[] | null = null
  let start = -1
  let valueDepth = 0
  let valueKind: 'container' | 'string' | 'scalar' = 'scalar'
  let valueRootKey: string | undefined
  let longInteger = false
  // current run of digits, and whether it can be a digit-only number
  let digits = 0
  let integerRun = false
  let previous = 0

  const rootValues: Record<string, unknown> = {}

  return {
    rootValues,
    write (chunk: Buffer): unknown[] {
      const children: unknown[] = []
      const endValue = (end: number) => {
        if (start !== -1) parts!.push(chunk.subarray(start, end))
        const value = parseValue(concat(parts!), longInteger)
        parts = null
        start = -1
        longInteger = false
        if (valueRootKey !== undefined) rootValues[valueRootKey] = value
        else if (value !== null && value !== undefined) children.push(value)
      }
      if (parts) start = 0
      if (keyParts) keyStart = 0

      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i]
        if (inString) {
          if (escaped) escaped = false
          else if (c === BACKSLASH) escaped = true
          else if (c === QUOTE) {
            inString = false
            if (keyParts) {
              keyParts.push(chunk.subarray(keyStart, i + 1))
              lastKey = JSON.parse(concat(keyParts).toString())
              keyParts = null
              keyStart = -1
            } else if (parts && valueKind === 'string' && stack.length === valueDepth) {
              endValue(i + 1)
            }
          }
          previous = c
          continue
        }

        if (c >= ZERO && c <= NINE) {
          if (digits === 0) integerRun = previous !== DOT && previous !== LOWER_E && previous !== UPPER_E && previous !== PLUS && previous !== MINUS
          digits++
        } else if (digits) {
          if (integerRun && digits >= LONG_INTEGER_DIGITS && c !== DOT && c !== LOWER_E && c !== UPPER_E) longInteger = true
          digits = 0
        }

        if (parts) {
          // a number or a literal ends at the next separator
          if (valueKind === 'scalar' && stack.length === valueDepth && (c === COMMA || c === CLOSE_ARRAY || c === CLOSE_OBJECT || c <= SPACE)) endValue(i)
        } else if (c > SPACE && c !== COMMA && c !== CLOSE_ARRAY && c !== CLOSE_OBJECT && c !== COLON) {
          const top = stack[stack.length - 1]
          const inPathContainer = matched === pathLength && stack.length === pathLength + 1
          let rootKey: string | undefined
          let isValue = false
          if (top === OPEN_ARRAY) isValue = inPathContainer
          else if (top === OPEN_OBJECT && afterColon) {
            isValue = inPathContainer
            if (!isValue && stack.length === 1 && lastKey !== null && rootKeys.includes(lastKey)) {
              isValue = true
              rootKey = lastKey
            }
          }
          if (isValue) {
            parts = []
            start = i
            valueDepth = stack.length
            valueKind = c === OPEN_OBJECT || c === OPEN_ARRAY ? 'container' : c === QUOTE ? 'string' : 'scalar'
            valueRootKey = rootKey
            longInteger = false
          }
        }

        if (c === QUOTE) {
          inString = true
          // a key of an object of the matched containers
          if (!parts && !afterColon && stack[stack.length - 1] === OPEN_OBJECT && (stack.length === matched + 1 || stack.length === 1)) {
            keyParts = []
            keyStart = i
          }
          afterColon = false
        } else if (c === COLON) {
          afterColon = true
        } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
          if (stack.length === matched + 1 && matched < pathLength && stack[stack.length - 1] === OPEN_OBJECT && afterColon && lastKey === path![matched]) matched++
          stack.push(c)
          afterColon = false
        } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
          stack.pop()
          if (stack.length <= matched) matched = Math.max(stack.length - 1, 0)
          if (parts && valueKind === 'container' && stack.length === valueDepth) endValue(i + 1)
          afterColon = false
        } else if (c > SPACE) {
          // a number, a literal or a comma
          afterColon = false
        }
        previous = c
      }

      if (parts && start !== -1) parts.push(chunk.subarray(start))
      if (keyParts && keyStart !== -1) keyParts.push(chunk.subarray(keyStart))
      start = -1
      keyStart = -1
      return children
    }
  }
}

// a stream of the children read by the scanner; like JSONStream, a text cut in the middle of a child ends without it
export const jsonStreamScanner = (options: JsonStreamScannerOptions) => {
  const scanner = createJsonStreamScanner(options)
  return new Transform({
    readableObjectMode: true,
    transform (chunk: Buffer | string, encoding, callback) {
      try {
        for (const value of scanner.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)) this.push(value)
        callback()
      } catch (err) {
        callback(err as Error)
      }
    }
  })
}
