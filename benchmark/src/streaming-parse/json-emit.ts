export function jsonRowFragment (pairs: [string, unknown][]): string {
  let out = '{'
  for (let i = 0; i < pairs.length; i++) {
    if (i) out += ','
    out += JSON.stringify(pairs[i][0]) + ':' + JSON.stringify(pairs[i][1])
  }
  return out + '}'
}
