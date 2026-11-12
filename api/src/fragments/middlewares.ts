// Express adapters for the fragment write guards: see docs/architecture/fragments.md §3.
// Thin by design — the decision lives in the express-free `fragmentWriteBodyError`
// (fragments/operations.ts), so it can be applied from a route chain AND from inside a handler
// whose body is only assembled there (the multipart-capable dataset POST/PUT-as-update route).
import type { RequestHandler } from 'express'
import { i18nHttpError } from '../misc/utils/i18n-errors.ts'
import { reqResourceOptional } from '../misc/utils/req-context.ts'
import { fragmentWriteBodyError } from './operations.ts'

/**
 * Throw the fragment write refusal, if any. Call it with the fully resolved write body, i.e. the
 * same object the route is about to persist.
 *
 * `allowPartOfChange` is true only on the PATCH routes, which route `partOf` through
 * `applyPartOfChange` instead of writing it raw.
 */
export const assertFragmentWriteBody = (
  body: Record<string, any> | undefined,
  resource: { partOf?: any } | undefined,
  allowPartOfChange: boolean
) => {
  const error = fragmentWriteBodyError(body, resource, { allowPartOfChange })
  if (error) throw i18nHttpError(400, error.key, error.params)
}

/**
 * Route-chain form of the above, for the routes whose body is already parsed when the chain runs
 * (every JSON-only write route). Mount it last in the chain, after the permission middlewares, so
 * an unauthorized caller still gets a 403 rather than this 400.
 */
export const fragmentWriteGuard = (allowPartOfChange: boolean): RequestHandler => (req, res, next) => {
  assertFragmentWriteBody(req.body, reqResourceOptional(req), allowPartOfChange)
  next()
}
