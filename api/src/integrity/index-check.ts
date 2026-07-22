// api/src/integrity/index-check.ts
// Index-consistency verdict (A1): is what users read through the ES alias consistent with the
// verified source of truth? Engine implementation lands with the REST/file adapters; the result
// type is shared with the checker and the dataset schema.
import type { DivergedEntry } from './index-operations.ts'

export type IndexCheckResult = {
  status: 'ok' | 'diverged' | 'unknown'
  checked?: number
  diverged?: number
  sample?: DivergedEntry[]
  count?: { expected: number, actual: number }
}
