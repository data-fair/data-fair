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

export const countVertices = (geometry: Geometry): number => {
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.reduce((n, g) => n + countVertices(g), 0)
  }
  let n = 0
  const walk = (coords: any): void => {
    if (typeof coords[0] === 'number') { n++; return }
    for (const c of coords) walk(c)
  }
  if ((geometry as any).coordinates) walk((geometry as any).coordinates)
  return n
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
