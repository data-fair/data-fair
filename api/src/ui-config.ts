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
  adminRole: config.adminRole as string,
  contribRole: config.contribRole as string,
  subscriptionUrl: config.subscriptionUrl as string | null,
  agentsIntegration: !!config.privateAgentsUrl,
  metricsIntegration: !!config.privateMetricsUrl || (config.extraNavigationItems as any[]).some((e: any) => e.iframe?.startsWith('/metrics/')),
  extraNavigationItems: config.extraNavigationItems as { id: string, iframe?: string, [key: string]: any }[],
  extraAdminNavigationItems: config.extraAdminNavigationItems as { id: string, iframe?: string, [key: string]: any }[],
  extraDocLinks: config.extraDocLinks as { icon?: string, href: string, title: string | Record<string, string> }[],
  brand: config.brand as { logo: string | null, title: string, description: string, url: string | null }
}

export type UiConfig = typeof uiConfig
export default uiConfig
