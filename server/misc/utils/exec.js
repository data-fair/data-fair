const spawn = require('child-process-promise').spawn
const debug = require('debug')('exec')

module.exports = async (cmd, args, options) => {
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
