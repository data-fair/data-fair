// The platform OpenAPI document: every service's document (a fragment) rewritten into its own
// namespace, then merged into one document per site. Pure: the fragments are fetched and cached
// elsewhere, this module only checks, rewrites and merges them.
// Design: docs/superpowers/specs/2026-10-19-platform-api-docs-design.md
import type { AgentSkill, Localized } from '@data-fair/openapi-mcp'

export type PlatformServiceId = 'datafair' | 'sd' | 'metrics'

export interface PlatformService {
  id: PlatformServiceId
  title: string
  /** prefix of the service's paths on the site */
  mountPath: string
  /** public path of its document on the site, skill hrefs resolve against it */
  docPath: string
}

export interface PreparedFragment {
  service: PlatformService
  /** prefixed, operationIds/x-agent/tags/$refs/security rewritten */
  paths: Record<string, any>
  /** without securitySchemes, names namespaced */
  components: Record<string, Record<string, any>>
  tags: { name: string, description?: string }[]
  /** namespaced name/tools, href still relative */
  skills: AgentSkill[]
  /** from its oauth2 scheme, {} when none */
  scopes: Record<string, string>
  warnings: string[]
}

export interface FragmentState {
  service: PlatformService
  fragment?: PreparedFragment
  status: 'ok' | 'stale' | 'error' | 'refused'
  error?: string
  fetchedAt?: string
}

/** the security schemes shared by name across services, as data-fair declares them */
export const sharedSecuritySchemes = {
  apiKey: { type: 'apiKey', in: 'header', name: 'x-apiKey' },
  sdCookie: { type: 'apiKey', in: 'cookie', name: 'id_token' }
} as const

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

/** same as openapi-mcp's snakeCase (a dev dependency here, not importable at runtime) */
export const snakeCase = (s: string) => s
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/_+/g, '_')
  .toLowerCase()

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

const operationsOf = (paths: Record<string, any>) => {
  const operations: { path: string, method: string, op: any }[] = []
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue
    for (const method of httpMethods) {
      if (isObject(item[method])) operations.push({ path, method, op: item[method] })
    }
  }
  return operations
}

const agentEntries = (op: any): Record<string, any>[] => {
  const xAgent = op['x-agent']
  if (Array.isArray(xAgent)) return xAgent.filter(isObject)
  return isObject(xAgent) ? [xAgent] : []
}

// The x-agent keys openapi-mcp accepts on an operation entry, a tag and a skill (its vocabulary
// schemas). A key outside them would make openapi-mcp refuse the whole merged document (a tag or
// a skill) or, under lint 'error', the whole tool set (an entry): the merge drops it with a
// warning, so that version skew in one service costs only that annotation detail. The values
// themselves are not checked here (openapi-mcp is not a runtime dependency).
export const agentEntryKeys = ['name', 'title', 'description', 'examples', 'annotations', 'params', 'fixed', 'body', 'bodyFields', 'bodyRequired', 'response', 'editor', 'security']
export const agentTagKeys = ['guide']
export const agentSkillKeys = ['name', 'description', 'href', 'body', 'tools']

/** keeps the known keys of an x-agent object, a warning naming the others */
const knownKeys = (value: Record<string, any>, keys: string[], at: string, warnings: string[]) => {
  const unknown = Object.keys(value).filter(key => !keys.includes(key))
  if (unknown.length) warnings.push(`${at}: x-agent ${unknown.join(', ')} not part of the platform vocabulary, removed`)
  return Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key)))
}

const isLocalized = (v: unknown, maxLength = Infinity): boolean => typeof v === 'string'
  ? v.length <= maxLength
  : isObject(v) && Object.keys(v).length > 0 && Object.values(v).every(text => typeof text === 'string' && text.length <= maxLength)

/** a requirement in a canonical form, as openapi-mcp compares them: schemes and scopes sorted */
const canonical = (requirement: Record<string, any>) => JSON.stringify(Object.keys(requirement).sort().map(k => [k, Array.isArray(requirement[k]) ? [...requirement[k]].sort() : requirement[k]]))

const isPublic = (security: unknown[]) => security.length === 0 || security.some(requirement => isObject(requirement) && Object.keys(requirement).length === 0)

/** rewrites every internal component $ref of a value, security schemes excepted */
const rewriteRefs = (value: any, ns: string): void => {
  if (Array.isArray(value)) {
    for (const item of value) rewriteRefs(item, ns)
    return
  }
  if (!isObject(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      const match = child.match(/^#\/components\/([^/]+)\/([^/]+)(.*)$/)
      if (match && match[1] !== 'securitySchemes') value[key] = `#/components/${match[1]}/${ns}_${match[2]}${match[3]}`
    } else {
      rewriteRefs(child, ns)
    }
  }
}

const sameScheme = (a: any, b: Record<string, string>) =>
  isObject(a) && a.type === b.type && a.in === b.in && a.name === b.name

interface SchemesCheck {
  /** declared by its oauth2 scheme, {} when none */
  scopes: Record<string, string>
  /** scheme names a requirement may use as is: the shared ones, and oauth2 when the fragment declares it */
  kept: Set<string>
  /** schemes the fragment declares that the merged document does not carry */
  dropped: Set<string>
}

/** checks the security schemes of a fragment, returns what its requirements may use or a refusal */
const checkSecuritySchemes = (schemes: Record<string, any>, warnings: string[]): SchemesCheck | { refused: string } => {
  let scopes: Record<string, string> = {}
  const kept = new Set<string>(Object.keys(sharedSecuritySchemes))
  const dropped = new Set<string>()
  for (const [name, scheme] of Object.entries(schemes)) {
    if (name === 'apiKey' || name === 'sdCookie') {
      if (!sameScheme(scheme, sharedSecuritySchemes[name])) return { refused: `security scheme ${name} differs from the platform's definition` }
    } else if (name === 'oauth2' || scheme?.type === 'oauth2') {
      if (name !== 'oauth2') return { refused: `oauth2 security scheme declared under another name: ${name}` }
      if (scheme?.type !== 'oauth2') return { refused: 'security scheme oauth2 is not of type oauth2' }
      const flows = isObject(scheme.flows) ? Object.keys(scheme.flows) : []
      if (flows.length !== 1 || flows[0] !== 'clientCredentials' || !isObject(scheme.flows.clientCredentials)) {
        return { refused: `oauth2 flows must be clientCredentials only, got ${flows.join(', ') || 'none'}` }
      }
      const declaredScopes = scheme.flows.clientCredentials.scopes ?? {}
      if (!isObject(declaredScopes)) return { refused: 'oauth2 scopes must be an object' }
      scopes = { ...declaredScopes }
      kept.add('oauth2')
    } else {
      dropped.add(name)
      warnings.push(`security scheme ${name} is not part of the platform document, its requirements are removed`)
    }
  }
  return { scopes, kept, dropped }
}

/**
 * the security of an operation (or of an x-agent entry) as the merged document can carry it, or a
 * refusal: a requirement must not name a scheme its fragment does not declare (it would bind to
 * the merged scheme of that name), an oauth2 scope must be declared, and the alternatives using a
 * scheme the merge drops are removed — failing closed to the cookie session when none is left.
 */
const platformSecurity = (security: unknown[], schemes: SchemesCheck, at: string): { security: unknown[] } | { refused: string } => {
  const alternatives: unknown[] = []
  for (const requirement of security) {
    if (!isObject(requirement)) return { refused: `${at} has a security requirement that is not an object` }
    let droppedAlternative = false
    for (const [name, requiredScopes] of Object.entries(requirement)) {
      if (schemes.dropped.has(name)) {
        droppedAlternative = true
      } else if (!schemes.kept.has(name)) {
        return { refused: `${at} requires the security scheme ${name} that its fragment does not declare` }
      } else if (name === 'oauth2') {
        if (!Array.isArray(requiredScopes)) return { refused: `${at} has oauth2 scopes that are not a list` }
        const scope = requiredScopes.find(scope => typeof scope !== 'string' || !Object.hasOwn(schemes.scopes, scope))
        if (scope !== undefined) return { refused: `${at} requires the scope ${scope} that its oauth2 scheme does not declare` }
      }
    }
    if (!droppedAlternative) alternatives.push(requirement)
  }
  if (security.length && !alternatives.length) return { security: [{ sdCookie: [] }] }
  return { security: alternatives }
}

/**
 * a skill in its namespace, or undefined (with a warning) when openapi-mcp would refuse it: a
 * skill sits at the merged root, where one bad entry fails the whole document
 */
const namespaceSkill = (ns: string, source: unknown, removedTools: Set<string>, warnings: string[]): AgentSkill | undefined => {
  if (!isObject(source)) {
    warnings.push('a skill that is not an object, removed')
    return undefined
  }
  const label = typeof source.name === 'string' ? source.name : '?'
  const skill = knownKeys(source, agentSkillKeys, `skill ${label}`, warnings)
  const name = `${ns}-${skill.name}`
  const problem = typeof skill.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64
    ? 'its name is not kebab-case (64 characters at most once namespaced)'
    : !isLocalized(skill.description, 1024)
        ? 'its description is not a text of 1024 characters at most'
        : (skill.href !== undefined && skill.body !== undefined)
            ? 'it has both href and body'
            : (skill.href !== undefined && !isLocalized(skill.href)) || (skill.body !== undefined && !isLocalized(skill.body))
                ? 'its href or body is not a text'
                : skill.tools !== undefined && !(Array.isArray(skill.tools) && skill.tools.every((tool: unknown) => typeof tool === 'string'))
                  ? 'its tools are not a list of names'
                  : undefined
  if (problem) {
    warnings.push(`skill ${label} removed: ${problem}`)
    return undefined
  }
  return {
    ...skill,
    name,
    // a skill must not name a tool whose entry the merge removed
    ...(skill.tools ? { tools: skill.tools.filter((tool: string) => !removedTools.has(tool)).map((tool: string) => `${ns}_${tool}`) } : {})
  } as AgentSkill
}

/** a tag's x-agent as openapi-mcp accepts it, or none (with a warning) */
const platformTag = (tag: Record<string, any>, title: string, warnings: string[]) => {
  const { 'x-agent': xAgent, ...rest } = tag
  const out: Record<string, any> = { ...rest, name: `${title} / ${tag.name}` }
  if (xAgent === undefined) return out
  const at = `tag ${tag.name}`
  if (!isObject(xAgent)) {
    warnings.push(`${at}: x-agent is not an object, removed`)
    return out
  }
  const kept = knownKeys(xAgent, agentTagKeys, at, warnings)
  if (kept.guide !== undefined && !isLocalized(kept.guide)) {
    warnings.push(`${at}: x-agent guide is not a text, removed`)
    delete kept.guide
  }
  if (Object.keys(kept).length) out['x-agent'] = kept
  return out
}

export function prepareFragment (service: PlatformService, sourceDoc: any): { fragment: PreparedFragment } | { refused: string } {
  if (!isObject(sourceDoc) || typeof sourceDoc.openapi !== 'string' || !/^3\.[01]\./.test(sourceDoc.openapi) || !isObject(sourceDoc.paths)) {
    return { refused: 'not an OpenAPI 3.0 or 3.1 document with paths' }
  }
  // a JSON copy, not structuredClone: the source shares objects between operations (data-fair's own
  // document does) and the in-place rewrites below must see each occurrence as its own object
  const doc = JSON.parse(JSON.stringify(sourceDoc))
  const ns = service.id
  const warnings: string[] = []

  const schemesCheck = checkSecuritySchemes(isObject(doc.components?.securitySchemes) ? doc.components.securitySchemes : {}, warnings)
  if ('refused' in schemesCheck) return schemesCheck

  const operations = operationsOf(doc.paths)

  // duplicate operationIds: the first keeps it, later ones lose it, unless one of them is a tool
  const byId = new Map<string, typeof operations>()
  for (const entry of operations) {
    const id = entry.op.operationId
    if (typeof id !== 'string') continue
    byId.set(id, [...(byId.get(id) ?? []), entry])
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue
    if (group.some(({ op }) => op['x-agent'] !== undefined)) return { refused: `duplicate operationId ${id} on an operation with x-agent` }
    for (const { path, method, op } of group.slice(1)) {
      delete op.operationId
      warnings.push(`duplicate operationId ${id} on ${method.toUpperCase()} ${path}`)
    }
  }

  // the merged document has one server, the site: servers below the root would be wrong after prefixing
  for (const item of Object.values(doc.paths)) if (isObject(item)) delete item.servers

  // tool names whose entry the merge removed, and those it kept (a name may be on both)
  const removedTools = new Set<string>()
  const keptTools = new Set<string>()
  let rootSecurity = doc.security
  if (rootSecurity !== undefined && !Array.isArray(rootSecurity)) {
    warnings.push('the root security is not a list of requirements, its operations require the cookie session')
    rootSecurity = [{ sdCookie: [] }]
  }
  for (const { path, method, op } of operations) {
    const at = `${method.toUpperCase()} ${path}`
    delete op.servers
    // every operation carries an explicit security, failing closed when none is declared anywhere
    // or when it is not a list
    let declared = op.security ?? rootSecurity ?? [{ sdCookie: [] }]
    if (!Array.isArray(declared)) {
      warnings.push(`${at}: security is not a list of requirements, the cookie session is required`)
      declared = [{ sdCookie: [] }]
    }
    const opSecurity = platformSecurity(declared, schemesCheck, at)
    if ('refused' in opSecurity) return opSecurity
    op.security = opSecurity.security
    const opAlternatives = new Set(op.security.map((requirement: Record<string, any>) => canonical(requirement)))

    // An entry that would make openapi-mcp refuse the tool set is removed (with a warning), the
    // operation's other entries kept: unknown keys go, and its security may only narrow the
    // operation's rewritten one, never widen it nor make it public.
    if (op['x-agent'] !== undefined && !isObject(op['x-agent']) && !(Array.isArray(op['x-agent']) && op['x-agent'].length && op['x-agent'].every(isObject))) {
      warnings.push(`${at}: x-agent is not an object or a list of objects, removed`)
      delete op['x-agent']
    }
    const entries: Record<string, any>[] = []
    for (const source of agentEntries(op)) {
      const entry = knownKeys(source, agentEntryKeys, at, warnings)
      const toolName = entry.name ?? (typeof op.operationId === 'string' ? snakeCase(op.operationId) : undefined)
      if (entry.security !== undefined) {
        if (!Array.isArray(entry.security)) {
          warnings.push(`${at}: x-agent entry with a security that is not a list, removed`)
          if (toolName) removedTools.add(toolName)
          continue
        }
        const entrySecurity = platformSecurity(entry.security, schemesCheck, `${at} x-agent`)
        if ('refused' in entrySecurity) return entrySecurity
        let narrowed = entrySecurity.security
        // a scheme the merge drops left the operation on the cookie session: the entry follows it
        if (entry.security.length && !narrowed.length) narrowed = [{ sdCookie: [] }]
        const outside = narrowed.filter(requirement => !opAlternatives.has(canonical(requirement as Record<string, any>)))
        if (outside.length) warnings.push(`${at}: x-agent security alternatives not in the operation's security removed: ${outside.map(r => JSON.stringify(r)).join(', ')}`)
        narrowed = narrowed.filter(requirement => opAlternatives.has(canonical(requirement as Record<string, any>)))
        if (!narrowed.length && !(entry.security.length === 0 && isPublic(op.security))) {
          warnings.push(`${at}: x-agent entry${typeof entry.name === 'string' ? ` ${entry.name}` : ''} removed, none of its security is left within the operation's`)
          if (toolName) removedTools.add(toolName)
          continue
        }
        entry.security = narrowed
      }
      if (toolName) keptTools.add(toolName)
      entries.push(entry)
    }
    if (op['x-agent'] !== undefined) {
      if (!entries.length) delete op['x-agent']
      else op['x-agent'] = Array.isArray(op['x-agent']) ? entries : entries[0]
    }

    const operationId = op.operationId
    if (entries.length && typeof operationId !== 'string') warnings.push(`x-agent on ${at} that has no operationId`)
    for (const entry of entries) {
      const name = entry.name ?? (typeof operationId === 'string' ? snakeCase(operationId) : undefined)
      if (name) entry.name = `${ns}_${name}`
    }
    if (typeof operationId === 'string') op.operationId = `${ns}_${operationId}`
    if (Array.isArray(op.tags)) op.tags = op.tags.map((tag: string) => `${service.title} / ${tag}`)
  }

  rewriteRefs(doc.paths, ns)
  const components: Record<string, Record<string, any>> = {}
  for (const [kind, items] of Object.entries(doc.components ?? {})) {
    if (kind === 'securitySchemes' || !isObject(items)) continue
    rewriteRefs(items, ns)
    components[kind] = Object.fromEntries(Object.entries(items).map(([name, item]) => [`${ns}_${name}`, item]))
  }

  const paths = Object.fromEntries(Object.entries(doc.paths).map(([path, item]) => [service.mountPath + path, item]))
  const tags = (Array.isArray(doc.tags) ? doc.tags : []).filter(isObject).map((tag: any) => platformTag(tag, service.title, warnings))
  for (const name of keptTools) removedTools.delete(name)
  const skills = (Array.isArray(doc['x-agent']?.skills) ? doc['x-agent'].skills : [])
    .map((skill: unknown) => namespaceSkill(ns, skill, removedTools, warnings))
    .filter((skill: AgentSkill | undefined): skill is AgentSkill => skill !== undefined)

  return { fragment: { service, paths, components, tags, skills, scopes: schemesCheck.scopes, warnings } }
}

const resolveHref = (href: Localized, base: string): Localized => typeof href === 'string'
  ? new URL(href, base).href
  : Object.fromEntries(Object.entries(href).map(([lang, value]) => [lang, new URL(value, base).href]))

export function mergePlatformDoc (siteOrigin: string, states: FragmentState[], info: { version: string, oauth2Description: string }): any {
  const paths: Record<string, any> = {}
  const components: Record<string, Record<string, any>> = {}
  const tags: { name: string, description?: string }[] = []
  const skills: AgentSkill[] = []
  const scopes: Record<string, string> = {}
  const services: Record<string, any>[] = []
  const pathOwners: Record<string, PlatformServiceId> = {}

  for (const { service, fragment, status, error, fetchedAt } of states) {
    const warnings = [...(fragment?.warnings ?? [])]
    services.push({
      id: service.id,
      status,
      ...(error !== undefined ? { error } : {}),
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
      warnings
    })
    if (!fragment) continue
    // the first service keeps a path; a later one claiming it again is left out of the merge
    for (const [path, item] of Object.entries(fragment.paths)) {
      if (Object.hasOwn(pathOwners, path)) {
        warnings.push(`path ${path} is already provided by ${pathOwners[path]}`)
        continue
      }
      pathOwners[path] = service.id
      paths[path] = item
    }
    for (const [kind, items] of Object.entries(fragment.components)) components[kind] = { ...components[kind], ...items }
    tags.push(...fragment.tags)
    const base = siteOrigin + service.docPath
    skills.push(...fragment.skills.map(skill => skill.href === undefined ? skill : { ...skill, href: resolveHref(skill.href, base) }))
    Object.assign(scopes, fragment.scopes)
  }

  return {
    openapi: '3.1.0',
    info: { title: 'API de la plateforme Data Fair', version: info.version },
    servers: [{ url: siteOrigin }],
    'x-agent': { skills },
    'x-platform': { services: services.map(({ warnings, ...entry }) => warnings.length ? { ...entry, warnings } : entry) },
    tags,
    components: {
      ...components,
      securitySchemes: {
        ...sharedSecuritySchemes,
        oauth2: {
          type: 'oauth2',
          description: info.oauth2Description,
          flows: {
            clientCredentials: { tokenUrl: `${siteOrigin}/simple-directory/api/auth/nhi-token`, scopes }
          }
        }
      }
    },
    paths
  }
}
