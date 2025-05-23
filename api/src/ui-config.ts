import config from '#config'

export const uiConfig = {
  map: config.map as { style: string, beforeLayer: string }
}
export type UiConfig = typeof uiConfig
export default uiConfig
