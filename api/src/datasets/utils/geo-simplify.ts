import type { Geometry } from 'geojson'
import simplify from '@turf/simplify'

// Reduce oversized geometries before they are stored in the calculated _geoshape
// field. _geoshape feeds tiles, geojson/wkt output and geo_shape/bbox queries; the
// raw geometry column is left untouched (full precision for downloads/exports).
//
// Douglas-Peucker via @turf/simplify is ~O(n log n) and ~20ms on a 97k-vertex
// MultiPolygon. Starting from a small tolerance and growing it x4 stops at roughly
// the least simplification that meets the budget, preserving maximum fidelity.

const BASE_TOLERANCE = 1e-7
const MAX_TOLERANCE = 0.1
const SIMPLIFIABLE = ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']

// Sum the coordinate-entry counts of nested coordinate arrays. `depth` is how many
// array levels sit above the leaf ring/line (the array of [lon, lat] entries), whose
// count is just its `.length`. This keeps counting O(number of rings/parts) instead of
// O(number of vertices) — ~2 array reads rather than ~100k recursive calls for a large
// polygon — and avoids allocating a closure on every call.
const sumLengths = (arr: any[], depth: number): number => {
  if (depth === 0) return arr.length
  let n = 0
  for (const sub of arr) n += sumLengths(sub, depth - 1)
  return n
}

export const countVertices = (geometry: Geometry): number => {
  switch (geometry.type) {
    case 'Point': return 1
    case 'MultiPoint':
    case 'LineString': return geometry.coordinates.length
    case 'MultiLineString':
    case 'Polygon': return sumLengths(geometry.coordinates, 1)
    case 'MultiPolygon': return sumLengths(geometry.coordinates, 2)
    case 'GeometryCollection': {
      let n = 0
      for (const g of geometry.geometries) n += countVertices(g)
      return n
    }
    default: return 0
  }
}

export const simplifyToVertexBudget = (geometry: Geometry, maxVertices: number): Geometry => {
  if (maxVertices < 0) return geometry
  if (countVertices(geometry) <= maxVertices) return geometry
  if (geometry.type === 'GeometryCollection') {
    return { type: 'GeometryCollection', geometries: geometry.geometries.map(g => simplifyToVertexBudget(g, maxVertices)) }
  }
  if (!SIMPLIFIABLE.includes(geometry.type)) return geometry
  let out: Geometry = geometry
  let tol = BASE_TOLERANCE
  while (countVertices(out) > maxVertices && tol <= MAX_TOLERANCE) {
    out = simplify(geometry as any, { tolerance: tol, highQuality: false, mutate: false })
    tol *= 4
  }
  return out
}
