export const fixLon = (val: number): number => {
  if (!Number.isFinite(val)) return val
  const wrapped = ((val % 360) + 360) % 360
  return wrapped >= 180 ? wrapped - 360 : wrapped
}
