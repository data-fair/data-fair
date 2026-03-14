import { test as teardown } from '@playwright/test'

teardown('Stateful tests teardown', () => {
  const pid = process.env.TAIL_PID
  if (pid) {
    try {
      process.kill(parseInt(pid))
    } catch {
      // process may have already exited
    }
  }
})
