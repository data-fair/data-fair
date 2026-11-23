import { Transform } from 'node:stream'
import Parser from 'jsonparse'

const OPEN_OBJECT = 123 // {
const CLOSE_OBJECT = 125 // }
const OPEN_ARRAY = 91 // [
const CLOSE_ARRAY = 93 // ]
const QUOTE = 34 // "
const BACKSLASH = 92 // \
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
const FEATURES_KEY = Buffer.from('"features"')

// jsonparse is the parser of JSONStream, that this scanner replaces. It reads the few elements
// JSON.parse would read differently (invalid JSON it accepts, like 007, and long integers it keeps
// as strings), so that every element keeps the value it had.
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

const parseElement = (text: Buffer, longInteger: boolean) => {
  if (longInteger) return jsonparse(text)
  try {
    return JSON.parse(text.toString())
  } catch {
    return jsonparse(text)
  }
}

// Reads the elements of the "features" array of the root object(s) of a geojson text, fed in order
// and in chunks of any size, like JSONStream.parse('features.*') (null elements skipped) at a
// fraction of its memory and time. It scans the bytes for structure characters only (strings and
// escapes, the nesting of { and [), keeps the bytes of the current element and hands them to
// JSON.parse once it closes: the native parser builds a feature in one pass, where a parser written
// in javascript holds tokens and intermediary strings for each value of a geometry that can have
// hundreds of thousands of vertices. Utf-8 is scanned as bytes, multi-byte sequences never contain
// ascii bytes.
// Unlike JSONStream, the text out of the features (the other keys of the root object) is not validated.
export const createGeojsonFeaturesScanner = () => {
  const stack: number[] = []
  let inString = false
  let escaped = false
  // string at the root object level (a key), and whether the last one was "features"
  let keyParts: Buffer[] | null = null
  let keyStart = -1
  let featuresKey = false
  let inFeatures = false
  // current element: bytes kept from previous chunks, start in the current chunk
  let parts: Buffer[] | null = null
  let start = -1
  let longInteger = false
  // current run of digits, and whether it can be a digit-only number
  let digits = 0
  let integerRun = false
  let previous = 0

  return {
    write (chunk: Buffer): unknown[] {
      const values: unknown[] = []
      const endElement = (end: number) => {
        if (start !== -1) parts!.push(chunk.subarray(start, end))
        const value = parseElement(parts!.length === 1 ? parts![0] : Buffer.concat(parts!), longInteger)
        parts = null
        start = -1
        longInteger = false
        if (value !== null && value !== undefined) values.push(value)
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
              featuresKey = FEATURES_KEY.equals(keyParts.length === 1 ? keyParts[0] : Buffer.concat(keyParts))
              keyParts = null
              keyStart = -1
            } else if (parts && stack.length === 2) {
              // a string element
              endElement(i + 1)
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

        if (inFeatures && stack.length === 2) {
          if (parts) {
            // a number or literal element ends at the next separator
            if (c === COMMA || c === CLOSE_ARRAY || c <= SPACE) endElement(i)
          } else if (c > SPACE && c !== COMMA && c !== CLOSE_ARRAY) {
            parts = []
            start = i
            longInteger = false
          }
        }

        if (c === QUOTE) {
          inString = true
          if (stack.length === 1 && stack[0] === OPEN_OBJECT) {
            keyParts = []
            keyStart = i
          }
        } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
          if (stack.length === 1 && stack[0] === OPEN_OBJECT && c === OPEN_ARRAY) inFeatures = featuresKey
          stack.push(c)
        } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
          stack.pop()
          if (stack.length === 2 && parts) endElement(i + 1)
          else if (stack.length === 1) inFeatures = false
        }
        previous = c
      }

      if (parts && start !== -1) parts.push(chunk.subarray(start))
      if (keyParts && keyStart !== -1) keyParts.push(chunk.subarray(keyStart))
      start = -1
      keyStart = -1
      return values
    }
  }
}

// like JSONStream, a text cut in the middle of an element ends without it
export const geojsonFeaturesStream = () => {
  const scanner = createGeojsonFeaturesScanner()
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
