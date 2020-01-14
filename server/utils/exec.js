const spawn = require('child-process-promise').spawn

module.exports = async (cmd, args) => {
  try {
    await spawn(cmd, args, { capture: ['stdout', 'stderr'] })
  } catch (err) {
    throw new Error(err.stderr || err.message)
  }
}
