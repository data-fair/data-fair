// Resolve the local JSON references ("#/..." pointers) of a schema, replacing each { $ref } object by a
// deep copy of its target. Remote refs, unresolvable pointers and circular refs are left untouched,
// which is what json-refs' resolveRefs(schema, { filter: ['local'] }) used to do.
export const resolveLocalRefs = (root: any) => {
  const atPointer = (pointer: string) => pointer.split('/').slice(1)
    .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((o, k) => (o !== null && typeof o === 'object') ? o[k] : undefined, root)
  const walk = (node: any, stack: string[]): any => {
    if (Array.isArray(node)) return node.map(n => walk(n, stack))
    if (node === null || typeof node !== 'object') return node
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) {
      if (stack.includes(node.$ref)) return node
      const target = atPointer(node.$ref)
      if (target === undefined) return node
      return walk(target, [...stack, node.$ref])
    }
    const res: any = {}
    for (const [k, v] of Object.entries(node)) res[k] = walk(v, stack)
    return res
  }
  return walk(root, [])
}
