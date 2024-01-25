// a small tool to switch between pump and pipeline to check if one of them is better
// at handling some occasional "premature close" errors that crash the service
const debug = require('debug')('pipe')

if (process.env.PIPE === 'pipeline') {
  debug('PIPE: use native pipeline method to pipe streams together')
  module.exports = require('stream/promises').pipeline
} else {
  debug('PIPE: use npm pump module to pipe streams together')
  module.exports = require('util').promisify(require('pump'))
}
