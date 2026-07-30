import type { Geometry } from 'geojson'
import findIntersections from 'sweepline-intersections'

// Detect whether a polygon geometry self-intersects (a "kink"), so it can be
// repaired before indexing as an Elasticsearch geo_shape.
//
// This replaces @turf/kinks, whose brute-force O(n^2) segment-pair comparison
// blocked the indexing worker's event loop for ~56s on a single 97k-vertex
// polygon (and starved concurrent batch tasks of memory -> OOM). sweepline-intersections
// uses a Bentley-Ottmann sweep line, O((N+K) log N), giving identical
// "does it self-intersect?" verdicts in ~200ms on the same geometry.
//
// The second argument is `ignoreSelfIntersections`: passing `false` makes the
// algorithm report self-intersections, which is exactly what we want to detect.
export const geometrySelfIntersects = (geometry: Geometry): boolean => {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return false
  return findIntersections({ type: 'Feature', geometry, properties: {} }, false).length > 0
}
