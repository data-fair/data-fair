export default {
  setLevel(level) {
    if (level === 'debug') {
      this.activeDebug = true
      this.activeWarn = true
    } else if (level === 'warn') {
      this.activeWarn = true
    } else if (level === 'error') {
      // nothing to do
    } else {
      console.error('Unsupported log level: ' + level)
      console.error('Use debug, warn or error')
      return
    }
    this.debug('Log level set to ', level)
  },
  debug() {
    if (!this.activeDebug) return
    console.log.apply(console, arguments)
  },
  warn() {
    if (!this.activeWarn) return
    console.warn.apply(console, arguments)
  },
  error() {
    console.error.apply(console, arguments)
  },
}
