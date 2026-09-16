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
  for (const topic of settings.topics ?? []) {
    if (topic.title) topic.title = topic.title.trim()
  }
  for (const license of settings.licenses ?? []) {
    if (license.title) license.title = license.title.trim()
    if (license.href) license.href = license.href.trim()
  }
  for (const concept of settings.privateVocabulary ?? []) {
    if (concept.title) concept.title = concept.title.trim()
    if (concept.description) concept.description = concept.description.trim()
    if (concept.tag) concept.tag = concept.tag.trim()
  }
  for (const apiKey of settings.apiKeys ?? []) {
    if (apiKey.title) apiKey.title = apiKey.title.trim()
  }
  for (const webhook of settings.webhooks ?? []) {
    if (webhook.title) webhook.title = webhook.title.trim()
    if (webhook.target?.params?.url) webhook.target.params.url = webhook.target.params.url.trim()
  }
  if (settings.datasetsMetadata) {
    const { spatial, temporal, frequency, creator, modified, keywords, conformsTo } = settings.datasetsMetadata
    for (const option of [spatial, temporal, frequency, creator, modified, keywords, conformsTo]) {
      if (option?.title) option.title = option.title.trim()
    }
    for (const custom of settings.datasetsMetadata.custom ?? []) {
      if (custom.key) custom.key = custom.key.trim()
      if (custom.title) custom.title = custom.title.trim()
    }
  }
  if (settings.info?.contact) {
    if (settings.info.contact.name) settings.info.contact.name = settings.info.contact.name.trim()
    if (settings.info.contact.url) settings.info.contact.url = settings.info.contact.url.trim()
    if (settings.info.contact.email) settings.info.contact.email = settings.info.contact.email.trim()
  }
}
