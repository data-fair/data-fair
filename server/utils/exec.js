const spawn = require('child-process-promise').spawn
const debug = require('debug')('exec')

module.exports = async (cmd, args, options) => {
  try {
    debug(`${cmd} ${args.join(' ')}`)
    await spawn(cmd, args, { capture: ['stdout', 'stderr'], ...options })
  } catch (err) {
    throw new Error(err.stderr || err.message)
  }
}
