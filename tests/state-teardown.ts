import { test as teardown } from '@playwright/test'

teardown('Stateful tests teardown', () => {
  const pids = process.env.TAIL_PIDS
  if (pids) {
    for (const pid of pids.split(',')) {
      try {
        process.kill(parseInt(pid))
      } catch {
        // process may have already exited
      }
    }
  }
})
