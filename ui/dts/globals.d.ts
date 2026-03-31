import type { UiConfig } from '../../api/src/ui-config'

declare global {
  interface Window {
    __UI_CONFIG: UiConfig
    __SITE_PATH: string
    __CSP_NONCE: string
  }
}
