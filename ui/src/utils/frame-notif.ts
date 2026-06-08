import type { UiNotif } from '@data-fair/lib-vue/ui-notif.js'

// Re-emit a notification forwarded by an embedded <d-frame> sub-app
// (catalogs, processings, ...) to the host's sendUiNotif.
//
// @data-fair/frame's convertVIframeUiNotif flattens the iframe message into
// { type, title, detail }, turning client/server errors into type
// 'warning' | 'error'. The naive handler { msg: title || detail, type } drops
// `detail` whenever a title is present, so error notifications lose their
// second (message) line once embedded.
//
// Here we rebuild the exact shape @data-fair/lib-vue produces for errors — see
// useAsyncAction (`sendUiNotif(getFullNotif({ msg, error }))`) whose getFullNotif
// error branch yields a UiNotifError { type: 'error', msg, errorMsg, clientError }
// (the `error` object is stripped at the iframe boundary by sendUiNotif). Returning
// that shape lets the host's getFullNotif keep `errorMsg`/`clientError` untouched and
// the ui-notif component render both the title and the detail line.

type FrameNotif = { type: string, title?: string, detail?: string }

export const frameNotifArg = (notif: FrameNotif): UiNotif => {
  if (notif.type === 'error' || notif.type === 'warning') {
    return {
      type: 'error',
      msg: notif.title ?? '',
      errorMsg: notif.detail ?? notif.title ?? '',
      clientError: notif.type === 'warning'
    }
  }
  return {
    type: notif.type as 'default' | 'info' | 'success' | 'warning',
    msg: notif.title ?? notif.detail ?? ''
  }
}
