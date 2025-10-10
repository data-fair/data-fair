import config from '#config'

export const uiConfig = {
  map: config.map as { style: string, beforeLayer: string },
  subscriptionUrl: config.subscriptionUrl as string | null,
  adminRole: config.adminRole as string,
  contribRole: config.contribRole as string,
  disableApplications: config.disableApplications as boolean,
  catalogsIntegration: !!config.privateCatalogsUrl,
  eventsIntegration: !!config.privateEventsUrl,
  portalsIntegration: !!config.privatePortalsManagerUrl
}
export type UiConfig = typeof uiConfig
export default uiConfig
