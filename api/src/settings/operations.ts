import slug from 'slugify'
import { type OptionsDesMetadonneesDeJeuxDeDonnees, type AIAssistantAudience, type Settings, assertValid as assertValidSettings } from '#types/settings/index.js'
import { type DepartmentSettings, assertValid as validateDepartmentSettings } from '#types/department-settings/index.js'
import { type AccountKeys, type User, type SessionStateAuthenticated } from '@data-fair/lib-express'
import trimFields from '../misc/utils/trim-fields.ts'
import nanoid from '../misc/utils/nanoid.ts'

export function validateSettings (settings: any): asserts settings is Settings | DepartmentSettings {
  if ((settings as DepartmentSettings).department) {
    validateDepartmentSettings(settings)
  } else {
    assertValidSettings(settings)
  }
}

export function isMainSettings (settings: Settings | DepartmentSettings): settings is Settings {
  return !(settings as DepartmentSettings).department
}
export function isUserSettings (settings: Settings | DepartmentSettings): settings is Settings {
  return (settings as DepartmentSettings).type === 'user'
}
export function isDepartmentSettings (settings: Settings | DepartmentSettings): settings is DepartmentSettings {
  return !!(settings as DepartmentSettings).department
}

type WebhookEvents = { events?: string[] }

// Strip event types that were removed from the webhooks `oneOf`: a stored value outside the closed
// list fails validation on every later write of the whole settings document. A webhook left with
// no event is dropped rather than kept empty: an empty list means "every event" to webhooks.trigger
// (and fails minItems). Returns null when nothing changes, so callers can skip the write.
export function removeWebhookEvents<W extends WebhookEvents> (webhooks: W[] | undefined, removed: string[]): W[] | null {
  if (!webhooks?.some(w => w.events?.some(e => removed.includes(e)))) return null
  const result: W[] = []
  for (const webhook of webhooks) {
    if (!webhook.events?.some(e => removed.includes(e))) {
      result.push(webhook)
      continue
    }
    const events = webhook.events.filter(e => !removed.includes(e))
    if (events.length) result.push({ ...webhook, events })
  }
  return result
}

export function cleanSettings (settings: Settings | DepartmentSettings) {
  if (settings.apiKeys) {
    for (const apiKey of settings.apiKeys) {
      delete apiKey.key
      delete apiKey.notifiedJ3At
      delete apiKey.notifiedJAt
    }
  }
  // @ts-ignore
  delete settings._id
  return settings
}

export const fillSettings = (owner: AccountKeys, user: User, settings: any): Settings | DepartmentSettings => {
  Object.assign(settings, owner)
  if (owner.type === 'user') {
    settings.name = user.name
    if (user.email) settings.email = user.email
  } else {
    const org = user.organizations.find(o => o.id === owner.id)
    if (!org) throw new Error('base org ref in user')
    settings.name = org.name
    if (owner.department) settings.name += ' - ' + owner.department
  }
  settings.apiKeys = settings.apiKeys || []
  for (const apiKey of settings.apiKeys) {
    delete apiKey.clearKey
  }
  settings.publicationSites = settings.publicationSites || []
  delete settings.operationsPermissions // deprecated
  return settings
}

export const cleanDatasetsMetadata = (datasetsMetadata: OptionsDesMetadonneesDeJeuxDeDonnees) => {
  // summary and description stay in the general tab, the dataset form has no other place for them
  for (const main of [datasetsMetadata.summary, datasetsMetadata.description] as any[]) delete main?.group
  for (const group of datasetsMetadata.groups ?? []) {
    if (!group.key) group.key = nanoid()
  }
  if (datasetsMetadata.custom) {
    const keys = new Set(datasetsMetadata.custom.map(c => c.key))
    for (const customMedata of datasetsMetadata.custom) {
      if (!customMedata.key) {
        const base = slug.default(customMedata.title, { lower: true, strict: true })
        let key = base
        for (let i = 2; keys.has(key); i++) key = `${base}-${i}`
        keys.add(key)
        customMedata.key = key
      }
      // a value list and several values only make sense for text
      if (customMedata.type && customMedata.type !== 'string') {
        delete customMedata.enum
        delete customMedata.multiple
      }
      // a recommended size only for a free text or several values, the settings form hides it otherwise
      if ((customMedata.type ?? 'string') !== 'string' || (customMedata.enum?.length && !customMedata.multiple)) {
        delete customMedata.recommendedMin
        delete customMedata.recommendedMax
      }
    }
  }
}

export const buildPublicationSiteSubscriptions = (owner: AccountKeys, site: any, publicUrl: string) => {
  const baseSubscription = {
    outputs: ['devices', 'email'],
    locale: 'fr',
    sender: owner,
    visibility: 'private'
  }
  return [
    {
      ...baseSubscription,
      topic: {
        key: `data-fair:dataset-publication-requested:${site.type}:${site.id}`,
        title: `Un contributeur demande de publier un jeu de données sur ${site.title || site.url || site.id}`
      },
      urlTemplate: publicUrl + '/dataset/{id}'
    },
    {
      ...baseSubscription,
      topic: {
        key: `data-fair:application-publication-requested:${site.type}:${site.id}`,
        title: `Un contributeur demande de publier une application sur ${site.title || site.url || site.id}`
      },
      urlTemplate: publicUrl + '/application/{id}'
    }
  ]
}

/**
 * Filter matching the account's root settings document, whatever department the caller is in.
 * Org-level settings (agentChat, compatODS, topics, info, datasetsMetadata, privateVocabulary) are
 * only stored there and departments inherit them, so reading them must never match a department
 * document. Department-level settings (apiKeys, publicationSites, webhooks) use ownerFilter instead.
 */
export const rootSettingsFilter = (owner: { type: string, id: string }) =>
  ({ type: owner.type, id: owner.id, department: { $exists: false } })

/**
 * Whether an organization member is in the AI assistant audience. An empty audience means every member.
 * A rule's department is "-" (main organization only), "*" (any department) or a department id,
 * its roles are all roles when empty. Unlike resource permissions, admins are not implicitly included.
 */
export const matchAgentChatAudience = (audience: AIAssistantAudience | undefined, member: { role?: string | null, department?: string }) => {
  if (!audience?.length) return true
  return audience.some(rule => {
    if (rule.department === '-' ? !!member.department : (rule.department !== '*' && rule.department !== member.department)) return false
    return !rule.roles?.length || (!!member.role && rule.roles.includes(member.role))
  })
}

/**
 * The session-less state of a publication-site write made with the portals secret key: a synthetic
 * admin of the owner read from the path. The owner name is not known here, the owner id stands for
 * it when the settings document has to be created.
 */
export const secretSessionState = (owner: AccountKeys): SessionStateAuthenticated => {
  const department = owner.department ? { department: owner.department } : {}
  const user: User = { id: owner.type === 'user' ? owner.id : 'portals', name: owner.id, email: '', organizations: [] }
  if (owner.type === 'organization') {
    user.organizations.push({ id: owner.id, name: owner.id, role: 'admin', ...department })
    return { user, account: { type: 'organization', id: owner.id, name: owner.id, ...department }, accountRole: 'admin', lang: 'fr' }
  }
  return { user, account: { type: 'user', id: owner.id, name: owner.id }, accountRole: 'admin', lang: 'fr' }
}

export type SettingsParams = { owner: AccountKeys, department?: string, ownerFilter: Record<string, any> }

export const parseOwnerParams = (type: 'user' | 'organization', idParam: string): SettingsParams => {
  const [id, department] = idParam.split(':')
  const owner: AccountKeys = { type, id }
  const params: SettingsParams = { owner, ownerFilter: {} }
  if (department) {
    params.department = department
    if (department !== '*') owner.department = department
  }
  params.ownerFilter = { ...owner }
  if (!department) params.ownerFilter.department = { $exists: false }
  return params
}

// trim leading/trailing whitespace of the free-text fields
export const trimSettings = (settings: Partial<Settings>) => {
  for (const topic of settings.topics ?? []) trimFields(topic, 'title')
  for (const license of settings.licenses ?? []) trimFields(license, 'title', 'href')
  for (const concept of settings.privateVocabulary ?? []) trimFields(concept, 'title', 'description', 'tag')
  for (const apiKey of settings.apiKeys ?? []) trimFields(apiKey, 'title')
  for (const webhook of settings.webhooks ?? []) {
    trimFields(webhook, 'title')
    if (webhook.target?.params) trimFields(webhook.target.params, 'url')
  }
  if (settings.datasetsMetadata) {
    const { summary, description, license, origin, image, topics, relatedDatasets, spatial, temporal, frequency, creator, modified, keywords, searchTerms, conformsTo } = settings.datasetsMetadata
    for (const option of [spatial, temporal, frequency, creator, modified, keywords, searchTerms, conformsTo]) {
      if (option) trimFields(option, 'title')
    }
    for (const option of [summary, description, license, origin, image, topics, relatedDatasets, spatial, temporal, frequency, creator, modified, keywords, searchTerms]) {
      if (!option) continue
      trimFields(option, 'description')
      // a blank help falls back to the native one, vjsf would drop an empty string and show a false diff
      if (!option.description) delete option.description
    }
    for (const custom of settings.datasetsMetadata.custom ?? []) {
      trimFields(custom, 'key', 'title', 'description')
      if (custom.enum) custom.enum = [...new Set(custom.enum.map(value => value.trim()).filter(Boolean))]
    }
    for (const group of settings.datasetsMetadata.groups ?? []) trimFields(group, 'title')
    trimFields(settings.datasetsMetadata, 'informationsTitle', 'coverageTitle')
  }
  if (settings.info?.contact) trimFields(settings.info.contact, 'name', 'url', 'email')
}
