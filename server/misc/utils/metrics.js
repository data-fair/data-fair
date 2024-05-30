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

  // eslint-disable-next-line no-new
  new Gauge({
    name: 'df_threads_utilization',
    help: 'Total number of applications',
    labelNames: ['task'],
    async collect () {
      const { results2sheetPiscina } = require('../../datasets/utils/outputs.js')
      const { sheet2csvPiscina } = require('../../datasets/utils/rest.js')
      const { geojson2pbfPiscina } = require('../../datasets/utils/tiles.js')
      // same as "utilization" from piscina but without dividing by maxThreads
      // this way we get an approximation of the CPU usage of the threads
      this.set({ task: 'results2sheet' }, (results2sheetPiscina.completed * results2sheetPiscina.runTime.mean) / results2sheetPiscina.duration)
      this.set({ task: 'sheet2csv' }, (sheet2csvPiscina.completed * sheet2csvPiscina.runTime.mean) / sheet2csvPiscina.duration)
      this.set({ task: 'geojson2pbf' }, (geojson2pbfPiscina.completed * geojson2pbfPiscina.runTime.mean) / geojson2pbfPiscina.duration)
    }
  })
}

/**
 *
 * @param {string} code
 * @param {any} message
 */
exports.internalError = (code, message) => {
  return import('@data-fair/lib/node/observer.js').then(({ internalError }) => {
    internalError(code, message)
  })
}
