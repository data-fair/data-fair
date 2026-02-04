import config from '#config'

export const uiConfig = {
  map: config.map as { style: string, beforeLayer: string },
  apiKeysMaxDuration: config.apiKeysMaxDuration as number,
  eventsIntegration: !!config.privateEventsUrl,
  portalsIntegration: !!config.privatePortalsManagerUrl,
  processingsIntegration: !!config.privateProcessingsUrl,
  catalogsIntegration: !!config.privateCatalogsUrl,
  baseAppsCategories: config.baseAppsCategories,
  disablePublicationSites: config.disablePublicationSites,
  disableApplications: config.disableApplications,
  compatODS: config.compatODS,
  adminRole: config.adminRole,
  contribRole: config.contribRole
}

export type UiConfig = typeof uiConfig
export default uiConfig
