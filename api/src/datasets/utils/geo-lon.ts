export const fixLon = (val: number): number => {
  // an already valid longitude is returned as is: this keeps 180 on the positive side (a world-wide
  // bbox or the zoom 0 tile would otherwise collapse to a zero-width envelope matching nothing) and
  // avoids the rounding noise of the modulo below (2.35 -> 2.3500000000000227)
  if (val >= -180 && val <= 180) return val
  if (!Number.isFinite(val)) return val
  const wrapped = ((val % 360) + 360) % 360
  // 180 is the boundary between both ends of the range, keep it on the side it was reached from
  if (wrapped === 180) return val > 0 ? 180 : -180
  return wrapped > 180 ? wrapped - 360 : wrapped
}
