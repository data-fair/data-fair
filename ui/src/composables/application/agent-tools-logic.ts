// Pure logic for the application agent tools, extracted for unit testing.

// Cap applied to serialized configurations returned to the LLM. A real dashboard
// configuration weighs 65KB of JSON; pretty-printing doubled that and a single
// get_application_config result of 110KB blew up the conversation context in traces.
export const CONFIG_MAX_CHARS = 8000

/** Serialize a config (or sub-config) compactly, truncated at maxChars. */
export function formatApplicationConfig (config: any, maxChars = CONFIG_MAX_CHARS): string {
  if (config === null || config === undefined || (typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length === 0)) {
    return 'This application is not configured yet.'
  }
  // No indentation: the model does not need it and it doubles the token cost.
  const serialized = JSON.stringify(config)
  if (serialized.length <= maxChars) return '```json\n' + serialized + '\n```'
  const keys = typeof config === 'object' && !Array.isArray(config) ? Object.keys(config) : []
  return '```json\n' + serialized.slice(0, maxChars) +
    '\n```\n' + `… truncated (${serialized.length} chars total). ` +
    (keys.length ? `Top-level keys: ${keys.join(', ')}. ` : '') +
    'Use the "path" parameter to read a sub-tree (e.g. "sections/0").'
}

// ---- data paths ("sections/0/elements/1/title", slash-separated) ----

export function parseConfigPath (path: string): string[] {
  return path.split('/').filter(s => s !== '')
}

export function getConfigValue (config: any, path: string): any {
  let value = config
  for (const segment of parseConfigPath(path)) {
    if (value === null || typeof value !== 'object') return undefined
    value = value[Array.isArray(value) ? Number(segment) : segment]
  }
  return value
}

// ---- config-schema.json projection ----

// Depth/size guards: real config schemas weigh 128–521KB with ~25 levels of nesting;
// returning them raw is what made the form getSchema tool time out in traces.
const SCHEMA_MAX_DEPTH = 3
const SCHEMA_MAX_ENUM = 12
export const SCHEMA_MAX_CHARS = 12000

function resolveRef (schema: any, root: any): any {
  if (!schema || typeof schema !== 'object') return schema
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    let target = root
    for (const segment of schema.$ref.slice(2).split('/')) {
      target = target?.[segment]
      if (target === undefined) return schema
    }
    // Merge sibling keys (title etc.) over the referenced schema.
    const { $ref, ...rest } = schema
    return { ...resolveRef(target, root), ...rest }
  }
  return schema
}

/** Merge allOf branches into a single object schema (shallow, enough for a listing). */
function mergeAllOf (schema: any, root: any): any {
  schema = resolveRef(schema, root)
  if (!schema?.allOf) return schema
  const merged: any = { ...schema, properties: { ...(schema.properties || {}) }, required: [...(schema.required || [])] }
  delete merged.allOf
  for (const branch of schema.allOf) {
    const resolved = mergeAllOf(branch, root)
    Object.assign(merged.properties, resolved?.properties || {})
    for (const r of resolved?.required || []) if (!merged.required.includes(r)) merged.required.push(r)
  }
  return merged
}

function describeType (schema: any): string {
  if (schema?.enum) return 'enum'
  if (Array.isArray(schema?.type)) return schema.type.join('|')
  if (schema?.type) return schema.type
  if (schema?.properties || schema?.allOf) return 'object'
  if (schema?.oneOf) return 'oneOf'
  return '?'
}

function projectSchemaNode (schema: any, root: any, path: string, depth: number, lines: string[]): void {
  schema = mergeAllOf(schema, root)
  if (!schema || typeof schema !== 'object') return

  if (schema.oneOf) {
    schema.oneOf.forEach((branch: any, i: number) => {
      const resolved = mergeAllOf(branch, root)
      lines.push(`${'  '.repeat(depth)}- variant ${i}${resolved?.title ? ` "${resolved.title}"` : ''}:`)
      if (depth < SCHEMA_MAX_DEPTH) projectSchemaNode(branch, root, path, depth + 1, lines)
    })
    return
  }

  const required: string[] = schema.required || []
  for (const [key, rawProp] of Object.entries<any>(schema.properties || {})) {
    const prop = mergeAllOf(rawProp, root)
    const childPath = path ? `${path}/${key}` : key
    const parts = [`${'  '.repeat(depth)}- \`${childPath}\` (${describeType(prop)}${required.includes(key) ? ', required' : ''})`]
    if (prop.title) parts.push(`"${prop.title}"`)
    if (prop.const !== undefined) parts.push(`const=${JSON.stringify(prop.const)}`)
    if (prop.default !== undefined) parts.push(`default=${JSON.stringify(prop.default)}`)
    if (prop.enum) {
      const shown = prop.enum.slice(0, SCHEMA_MAX_ENUM)
      parts.push(`values: ${shown.map((v: any) => JSON.stringify(v)).join(', ')}${prop.enum.length > SCHEMA_MAX_ENUM ? ` … (${prop.enum.length} total)` : ''}`)
    }
    lines.push(parts.join(' '))
    if (depth < SCHEMA_MAX_DEPTH) {
      if (prop.type === 'array' && prop.items) {
        const items = mergeAllOf(prop.items, root)
        lines.push(`${'  '.repeat(depth + 1)}- \`${childPath}/<i>\` (array items, ${describeType(items)})${items?.title ? ` "${items.title}"` : ''}`)
        projectSchemaNode(prop.items, root, `${childPath}/<i>`, depth + 2, lines)
      } else if (prop.properties || prop.allOf || prop.oneOf) {
        projectSchemaNode(prop, root, childPath, depth + 1, lines)
      }
    } else if (prop.properties || prop.items || prop.oneOf) {
      lines.push(`${'  '.repeat(depth + 1)}… deeper structure elided — call again with path "${childPath}"`)
    }
  }
}

/** Navigate a schema following data-path segments (properties + array items). */
function schemaAtPath (schema: any, root: any, path: string): any {
  let node = schema
  for (const segment of parseConfigPath(path)) {
    node = mergeAllOf(node, root)
    if (!node) return undefined
    if (/^(\d+|<i>)$/.test(segment) && node.items) node = node.items
    else node = node.properties?.[segment]
  }
  return node
}

/**
 * Compact markdown listing of a config-schema.json: data paths, types, titles,
 * required flags and enums, depth-limited. `path` drills into a sub-schema.
 */
export function projectConfigSchema (schema: any, path?: string, maxChars = SCHEMA_MAX_CHARS): string {
  let target = schema
  if (path) {
    target = schemaAtPath(schema, schema, path)
    if (target === undefined) return `No schema found at path "${path}". Call without path to list top-level properties.`
  }
  const lines: string[] = []
  if (path) lines.push(`Schema at \`${path}\`:`)
  projectSchemaNode(target, schema, path ? path.replace(/\/$/, '') : '', 0, lines)
  if (!lines.length) return 'The schema declares no properties at this path.'
  let out = lines.join('\n')
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + '\n… truncated. Call again with a deeper "path" to read a specific sub-schema.'
  }
  return out
}
