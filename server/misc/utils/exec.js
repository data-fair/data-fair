import { spawn } from 'child-process-promise'
import debugLib from 'debug'

const debug = debugLib('exec')

export default async (cmd, args, options) => {
  try {
    debug(`${cmd} ${args.join(' ')}`)
    const res = await spawn(cmd, args, { capture: ['stdout', 'stderr'], ...options })
    debug('stdout', res.stdout)
    debug('stderr', res.stderr)
    return res
  } catch (err) {
    throw new Error(err.stderr || err.message)
  }
}
