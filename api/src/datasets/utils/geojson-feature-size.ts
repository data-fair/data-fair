// Largest feature (in vertices) a geojson file may contain. The indexing worker holds a feature
// whole, as parsed by the read stream, then as the copy geometry2fields parses and simplifies: the
// smallest heap that indexes one feature (worst of several runs) is ~224MB at 400k vertices, ~290MB
// at 500k and ~420MB at 1M, out of the 512MB the worker thread shares with other tasks. The
// simplification of _geoshape runs on the full geometry, so a feature cannot be accepted on the
// grounds that it would be simplified later.
export const MAX_FEATURE_VERTICES = 400_000

const OPEN_OBJECT = 123 // {
const CLOSE_OBJECT = 125 // }
const OPEN_ARRAY = 91 // [
const CLOSE_ARRAY = 93 // ]
const QUOTE = 34 // "
const BACKSLASH = 92 // \
const MINUS = 45 // -
const ZERO = 48
const NINE = 57

export type OversizedFeature = { index: number, vertices: number }

// Counts the vertices of each feature of a geojson FeatureCollection, from its text fed in order and
// in chunks of any size. It never parses a value, only scans structure characters, so it costs one
// pass over the text and memory bounded by the nesting depth: it can stop a file before a parser
// materializes an oversized feature.
// A vertex is an array of a feature whose direct children are numbers ([lon, lat] or [lon, lat, z]).
// A feature is a value closing at depth 2 (root object > features array > feature); the count restarts after each.
// write() returns the first feature found over maxVertices (0-based index), as soon as the limit is
// crossed, and null otherwise.
export const createFeatureVertexCounter = (maxVertices: number) => {
  const stack: number[] = []
  let inString = false
  let escaped = false
  // the innermost open array has a number as direct child
  let numericArray = false
  let featureIndex = 0
  let vertices = 0

  return {
    // utf-8 bytes or decoded text: multi-byte utf-8 sequences never contain ascii bytes, so the
    // structure characters are found the same way in both, even across a split character
    write (chunk: string | Uint8Array): OversizedFeature | null {
      const isString = typeof chunk === 'string'
      for (let i = 0; i < chunk.length; i++) {
        const c = isString ? chunk.charCodeAt(i) : chunk[i]
        if (inString) {
          if (escaped) escaped = false
          else if (c === BACKSLASH) escaped = true
          else if (c === QUOTE) inString = false
          continue
        }
        if (c === QUOTE) {
          inString = true
        } else if (c === OPEN_ARRAY || c === OPEN_OBJECT) {
          stack.push(c)
          numericArray = false
        } else if (c === CLOSE_ARRAY) {
          stack.pop()
          // inside a feature only (root > features > feature), not a root bbox
          if (numericArray && stack.length >= 3) {
            vertices++
            if (vertices > maxVertices) return { index: featureIndex, vertices }
          }
          numericArray = false
        } else if (c === CLOSE_OBJECT) {
          stack.pop()
          numericArray = false
          if (stack.length === 2 && stack[0] === OPEN_OBJECT && stack[1] === OPEN_ARRAY) {
            featureIndex++
            vertices = 0
          }
        } else if ((c === MINUS || (c >= ZERO && c <= NINE)) && stack[stack.length - 1] === OPEN_ARRAY) {
          numericArray = true
        }
      }
      return null
    }
  }
}
