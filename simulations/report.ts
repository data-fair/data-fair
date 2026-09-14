/**
 * Reads the evidence and says what happened. Exit code is non-zero if any case
 * was unsatisfactory, invalid, not judged, or never ran — a suite that cannot
 * fail is not a suite.
 */
import { reportCases, selectCases, evidenceDir } from '@data-fair/lib-agents-sim'
import { cases } from './cases/index.ts'

// argv wins, then SIM_CASES, so `npm run simulate:report` after a filtered
// `SIM_CASES=… npm run simulate` reports on the cases that actually ran instead
// of failing on the ones that deliberately did not.
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (process.env.SIM_CASES ?? '').split(',').map(s => s.trim()).filter(Boolean)
// exitCode, not process.exit(): stdout is async when piped (it is, under npm
// run) and process.exit discards pending writes, truncating the report.
process.exitCode = reportCases(selectCases(cases, names), evidenceDir) === 0 ? 0 : 1
