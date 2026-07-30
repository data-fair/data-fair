// shared ES-error handling for the read/search/master-data route groups (extracted from router.js, phase 6d)
import type { Request } from 'express'
import { Counter } from 'prom-client'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import * as esUtils from '../es/index.ts'
import { queryAdvice } from '../../misc/utils/query-advice.ts'

const esQueryErrorCounter = new Counter({
  name: 'df_es_query_error',
  help: 'Errors in elasticearch queries'
})

// Error from ES backend should be stored in the journal
export const manageESError = async (req: Request, err: any): Promise<never> => {
  const { message, status } = esUtils.extractError(err)
  if (status === 400) {
    // console.error(`(es-query-${status}) elasticsearch query error ${req.dataset.id}`, req.originalUrl, status, req.headers.referer || req.headers.referrer, message, err.stack)
    esQueryErrorCounter.inc()
  } else if (status === 499 || status === 504) {
    // 499 = client gave up (browser cancel, proxy timeout) -> the query was aborted, nothing to report
    // 504 = the read timeout elapsed (ES "Time exceeded" guard or the per-request client timeout) -> a
    // slow query, not an internal failure
    // in both cases avoid internalError noise (a flood of these is exactly the overload symptom we want to handle)
  } else {
    internalError('es-query-' + status, err)
  }

  // We used to store an error on the data whenever a dataset encountered an elasticsearch error
  // but this can end up storing too many errors when the cluster is in a bad state
  // revert to simply logging
  // if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
  // await mongo.db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'error' } })
  // await journals.log(req.dataset, { type: 'error', data: message })
  // }
  // on overload-symptom statuses, hint at how to make the query cheaper (no-op when no rule applies)
  const finalMessage = (status === 504 || status === 429) ? message + queryAdvice(req) : message
  throw httpError(status, finalMessage)
}
