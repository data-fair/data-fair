// Topical home for the publicBaseUrl / publicWsBaseUrl request context
// (the per-domain public URL of data-fair, set once in app.js). See code-conventions.md §2.
import { defineReqContext } from './req-context.ts'

// publicBaseUrl keeps its legacyProp: datasets (Phase 6) still reads req.publicBaseUrl directly.
const publicBaseUrlCtx = defineReqContext<string>('publicBaseUrl', 'publicBaseUrl')
export const setReqPublicBaseUrl = publicBaseUrlCtx.set
export const reqPublicBaseUrl = publicBaseUrlCtx.get

// publicWsBaseUrl keeps its legacyProp until Task A6: applications/proxy.ts still reads
// req.publicWsBaseUrl directly. A6 migrates that reader, then drops this legacyProp.
const publicWsBaseUrlCtx = defineReqContext<string>('publicWsBaseUrl', 'publicWsBaseUrl')
export const setReqPublicWsBaseUrl = publicWsBaseUrlCtx.set
export const reqPublicWsBaseUrl = publicWsBaseUrlCtx.get
