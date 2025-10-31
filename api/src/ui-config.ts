import config from '#config'

export const uiConfig = {
  map: config.map as { style: string, beforeLayer: string },
  apiKeysMaxDuration: config.apiKeysMaxDuration as number
}
export type UiConfig = typeof uiConfig
export default uiConfig
