import path from 'node:path'

// where the dev processes write their logs: DEV_LOG_DIR (default dev/logs, as `npm run dev` does), one
// <DEV_LOG_PREFIX><name>.log file per process (no prefix by default)
export const devLogFile = (name: 'api' | 'mock' | 'ui') =>
  path.join(process.env.DEV_LOG_DIR || 'dev/logs', `${process.env.DEV_LOG_PREFIX ?? ''}${name}.log`)
