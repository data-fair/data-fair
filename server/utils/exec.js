const spawn = require('child-process-promise').spawn

module.exports = async (cmd, args) => {
  try {
    spawn(cmd, args, { capture: ['stderr'] })
  } catch (err) {
    throw new Error(err.stderr || err.message)
  }
}
