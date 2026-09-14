/**
 * Reads the evidence and says what happened. Exit code is non-zero if any case
 * was unsatisfactory, invalid, not judged, or never ran — a suite that cannot
 * fail is not a suite.
 */
import { reportCases, selectCases, evidenceDir } from '@data-fair/lib-agents-sim'
import { cases } from './cases/index.ts'

process.exit(reportCases(selectCases(cases, process.argv.slice(2)), evidenceDir) === 0 ? 0 : 1)
