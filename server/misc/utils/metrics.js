const { Gauge } = require('prom-client')

/**
 * @param {import('mongodb').Db} db
 */
exports.init = async (db) => {
  // global metrics based on db connection

  const { servicePromRegistry } = await import('@data-fair/lib/node/observer.js')

  // eslint-disable-next-line no-new
  new Gauge({
    name: 'df_datasets_total',
    help: 'Total number of datasets',
    registers: [servicePromRegistry],
    async collect () {
      this.set(await db.collection('datasets').estimatedDocumentCount())
    }
  })

  // eslint-disable-next-line no-new
  new Gauge({
    name: 'df_applications_total',
    help: 'Total number of applications',
    registers: [servicePromRegistry],
    async collect () {
      this.set(await db.collection('applications').estimatedDocumentCount())
    }
  })
}

/**
 *
 * @param {string} code
 * @param {any} message
 */
exports.internalError = (code, message) => {
  import('@data-fair/lib/node/observer.js').then(({ internalError }) => {
    internalError(code, message)
  })
}
