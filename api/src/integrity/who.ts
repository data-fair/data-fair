// Express-aware adapter over the pure `buildWho` (operations.ts stays express-free — see
// api/src/integrity/README.md and the "module invariants" note at the top of that file). This is
// the ONLY place in the integrity module allowed to touch `req`.
import type { Request } from 'express'
import { reqSession } from '@data-fair/lib-express'
import { reqApiKeyRef } from '../misc/utils/req-context.ts'
import { buildWho, type WhoHint } from './operations.ts'

// Captures the HTTP-boundary parts of a `.who` attribution hint (design doc §2.1):
// - `user.id` from the session (buildWho drops the read-only-API-key pseudo-user itself);
// - `apiKey.id` from the req-context accessor set by the api-key middleware (T7, design §5.1) when
//   the write was authenticated by a settings API key — never set for the resource-scoped
//   `_readApiKey` read-only pseudo-user, and never threaded into `RevisionContext` (the locked
//   revision JSON stays identity-free — only the `.who` sibling, which has its own bounded 180-day
//   retention, may carry it);
// - `ip` from `req.ip` — 'trust proxy' is set in app.js, and in environments with the enriched
//   haproxy L1 ingress, X-Forwarded-For is forced to the real client IP (design doc §0);
// - `geo` from the trusted reverse-proxy headers X-Country / X-ASN / X-ASN-Org, present only
//   behind that ingress — absent elsewhere, which buildWho already handles (no geo at all).
export const whoFromReq = (req: Request): WhoHint | undefined => {
  const sessionState = reqSession(req)
  const userId = sessionState.user?.id
  const apiKeyId = reqApiKeyRef(req)
  const ip = req.ip
  const country = req.headers['x-country'] as string | undefined
  const asnHeader = req.headers['x-asn'] as string | undefined
  // guard against a garbage (non-numeric) header value before it ever reaches buildWho, which
  // types geo.asn as a number and does not itself validate the conversion (T1 review note)
  const asnNum = asnHeader !== undefined ? Number(asnHeader) : undefined
  const asn = asnNum !== undefined && !Number.isNaN(asnNum) ? asnNum : undefined
  const asnOrg = req.headers['x-asn-org'] as string | undefined

  const built = buildWho({ userId, apiKeyId, ip, country, asn, asnOrg }, '')
  if (!built) return undefined
  // strip the placeholder date: whoFromReq captures a WhoHint (no date), the date is stamped by
  // the relay at anchor time, not at HTTP-request time (they can legitimately differ — the relay
  // is async)
  const { date, ...hint } = built
  return hint
}
