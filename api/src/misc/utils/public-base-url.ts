// Topical home for the publicBaseUrl / publicWsBaseUrl request context
// (the per-domain public URL of data-fair, set once in app.js). See code-conventions.md §2.
import { defineReqContext } from './req-context.ts'

const publicBaseUrlCtx = defineReqContext<string>('publicBaseUrl')
export const setReqPublicBaseUrl = publicBaseUrlCtx.set
export const reqPublicBaseUrl = publicBaseUrlCtx.get

// publicWsBaseUrl has no legacyProp: the legacyProp was dropped in Task A6 now that the
// setter (app.js, via setReqPublicWsBaseUrl) and the sole reader (applications/proxy.ts,
// via reqPublicWsBaseUrl) both go through the accessor.
const publicWsBaseUrlCtx = defineReqContext<string>('publicWsBaseUrl')
export const setReqPublicWsBaseUrl = publicWsBaseUrlCtx.set
export const reqPublicWsBaseUrl = publicWsBaseUrlCtx.get
