import { ofetch } from 'ofetch'

export const $uiConfig = window.__UI_CONFIG
export const $sitePath = window.__SITE_PATH
export const $cspNonce = window.__CSP_NONCE
export const $siteUrl = window.location.origin + $sitePath
export const $sdUrl = $sitePath + '/simple-directory'
export const $apiPath = $sitePath + '/data-fair/api/v1'
export const $fetch = ofetch.create({ baseURL: $apiPath })
