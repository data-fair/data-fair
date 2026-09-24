import slug from 'slugify'
import { type OptionsDesMetadonneesDeJeuxDeDonnees, type Settings, assertValid as assertValidSettings } from '#types/settings/index.js'
import { type DepartmentSettings, assertValid as validateDepartmentSettings } from '#types/department-settings/index.js'
import { type AccountKeys, type User } from '@data-fair/lib-express'

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
    settings.email = user.email
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
  if (datasetsMetadata.custom) {
    for (const customMedata of datasetsMetadata.custom) {
      if (!customMedata.key) customMedata.key = slug.default(customMedata.title, { lower: true, strict: true })
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
