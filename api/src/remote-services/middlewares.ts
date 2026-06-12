import { defineReqContext } from '../misc/utils/req-context.ts'

// remote-services is slated for deprecation; this accessor only generalizes the req-context
// practice without restructuring the module. Typed loosely (`any`) on purpose — the module's
// service documents are dynamically indexed (Object.keys / svc[key]); the accessor module is the
// sanctioned home for such a cast.
const remoteService = defineReqContext<any>('remoteService', 'remoteService')
export const setReqRemoteService = remoteService.set
export const reqRemoteService = remoteService.get
