// Express-aware adapter over the pure `buildWho` (operations.ts stays express-free — see
// api/src/integrity/README.md and the "module invariants" note at the top of that file). This is
// the ONLY place in the integrity module allowed to touch `req`.
import type { Request } from 'express'
import { reqSession } from '@data-fair/lib-express'
import { buildWho, type WhoHint } from './operations.ts'

// Captures the HTTP-boundary parts of a `.who` attribution hint (design doc §2.1):
// - `user.id` from the session (buildWho drops the read-only-API-key pseudo-user itself);
// - `ip` from `req.ip` — 'trust proxy' is set in app.js, and in environments with the enriched
//   haproxy L1 ingress, X-Forwarded-For is forced to the real client IP (design doc §0);
// - `geo` from the trusted reverse-proxy headers X-Country / X-ASN / X-ASN-Org, present only
//   behind that ingress — absent elsewhere, which buildWho already handles (no geo at all).
//
// `apiKey.id` (design §5.1, A2) is deliberately OMITTED here: it is meant to come from a
// req-context accessor set by the api-key middleware once T7 adds it (`reqApiKeyRef` in
// misc/utils/req-context.ts, mirroring `setReqBypassPermissions`). No such accessor exists on
// this branch yet — referencing one now would be dead code — so API-key-authenticated writes
// currently produce a `.who` with user/ip/geo only, until T7 lands.
export const whoFromReq = (req: Request): WhoHint | undefined => {
  const sessionState = reqSession(req)
  const userId = sessionState.user?.id
  const ip = req.ip
  const country = req.headers['x-country'] as string | undefined
  const asnHeader = req.headers['x-asn'] as string | undefined
  // guard against a garbage (non-numeric) header value before it ever reaches buildWho, which
  // types geo.asn as a number and does not itself validate the conversion (T1 review note)
  const asnNum = asnHeader !== undefined ? Number(asnHeader) : undefined
  const asn = asnNum !== undefined && !Number.isNaN(asnNum) ? asnNum : undefined
  const asnOrg = req.headers['x-asn-org'] as string | undefined

  const built = buildWho({ userId, ip, country, asn, asnOrg }, '')
  if (!built) return undefined
  // strip the placeholder date: whoFromReq captures a WhoHint (no date), the date is stamped by
  // the relay at anchor time, not at HTTP-request time (they can legitimately differ — the relay
  // is async)
  const { date, ...hint } = built
  return hint
}
