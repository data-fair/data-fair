import type { Geometry, Position } from 'geojson'
import simplify from '@turf/simplify'
import cleanCoords from '@turf/clean-coords'

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

// The last tolerance of the x4 ladder, where it stops when the budget is never met.
let LAST_TOLERANCE = BASE_TOLERANCE
while (LAST_TOLERANCE * 4 <= MAX_TOLERANCE) LAST_TOLERANCE *= 4

// Douglas-Peucker drops vertices inside a part, never a whole part: a polygon ring keeps at least
// 4 coordinate entries and a line at least 2. A geometry made of many small parts can stay above
// the budget at any tolerance (a vectorized raster: 134k rings -> 535k vertices at best).
const minVertices = (geometry: Geometry): number => {
  switch (geometry.type) {
    case 'LineString': return 2
    case 'MultiLineString': return 2 * geometry.coordinates.length
    case 'Polygon': return 4 * geometry.coordinates.length
    case 'MultiPolygon': {
      let n = 0
      for (const polygon of geometry.coordinates) n += 4 * polygon.length
      return n
    }
    default: return 0
  }
}

// @turf/simplify first runs cleanCoords on every ring, which throws on a ring left with fewer than
// 4 points once duplicate and aligned points are removed: such a ring has no area. One of them used
// to fail the whole simplification and the feature lost its _geoshape. Polygons with a zero-area
// outer ring and zero-area holes are dropped instead: they hold no surface, and only the derived
// _geoshape is affected, the raw geometry column keeps them.
// cleanCoords only removes duplicates and points lying exactly on the segment between their
// neighbours, which keeps the area: fewer than 4 points left means none. Its other errors (an
// unclosed ring, malformed coordinates) can come with a real area: the ring is kept, and
// simplify still reports the geometry as invalid.
const isZeroAreaRing = (ring: Position[]): boolean => {
  try {
    cleanCoords({ type: 'Polygon', coordinates: [ring] })
    return false
  } catch (err: any) {
    return typeof err?.message === 'string' && err.message.startsWith('invalid polygon, fewer than 4 points')
  }
}
// null when the outer ring itself has no area
const dropZeroAreaHoles = (polygon: Position[][]): Position[][] | null => {
  if (!polygon.length || isZeroAreaRing(polygon[0])) return null
  return polygon.filter((ring, i) => i === 0 || !isZeroAreaRing(ring))
}
// a geometry with nothing left is kept as is: simplify still reports it as invalid
const dropZeroAreaRings = (geometry: Geometry): Geometry => {
  if (geometry.type === 'Polygon') {
    const coordinates = dropZeroAreaHoles(geometry.coordinates)
    return coordinates ? { ...geometry, coordinates } : geometry
  }
  if (geometry.type === 'MultiPolygon') {
    const coordinates: Position[][][] = []
    for (const polygon of geometry.coordinates) {
      const kept = dropZeroAreaHoles(polygon)
      if (kept) coordinates.push(kept)
    }
    return coordinates.length ? { ...geometry, coordinates } : geometry
  }
  return geometry
}

export const simplifyToVertexBudget = (geometry: Geometry, maxVertices: number): Geometry => {
  if (maxVertices < 0) return geometry
  if (countVertices(geometry) <= maxVertices) return geometry
  if (geometry.type === 'GeometryCollection') {
    return { type: 'GeometryCollection', geometries: geometry.geometries.map(g => simplifyToVertexBudget(g, maxVertices)) }
  }
  if (!SIMPLIFIABLE.includes(geometry.type)) return geometry
  const input = dropZeroAreaRings(geometry)
  let out: Geometry = input
  // an unreachable budget would climb the whole ladder, re-simplifying the full geometry at each step
  // (~40s on 2.5M vertices) to end at its last tolerance: go there directly, same result
  let tol = minVertices(input) > maxVertices ? LAST_TOLERANCE : BASE_TOLERANCE
  while (countVertices(out) > maxVertices && tol <= MAX_TOLERANCE) {
    out = simplify(input as any, { tolerance: tol, highQuality: false, mutate: false })
    tol *= 4
  }
  return out
}
