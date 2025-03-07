import { Gauge } from 'prom-client'
import { servicePromRegistry } from '@data-fair/lib-node/observer.js'

/**
 * @param {import('mongodb').Db} db
 */
export const init = async (db) => {
  // global metrics based on db connection

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
    help: 'Utilization of worker threads',
    labelNames: ['task'],
    async collect () {
      const { results2sheetPiscina } = await import('../../datasets/utils/outputs.js')
      const { sheet2csvPiscina } = await import('../../datasets/utils/rest.js')
      const { geojson2pbfPiscina } = await import('../../datasets/utils/tiles.js')
      const { fetchDCATPiscina } = await import('../../catalogs/plugins/dcat.js')

      // same as "utilization" from piscina but without dividing by maxThreads
      // this way we get an approximation of the CPU usage of the threads
      this.set({ task: 'results2sheet' }, (results2sheetPiscina.completed * results2sheetPiscina.runTime.mean) / results2sheetPiscina.duration)
      this.set({ task: 'sheet2csv' }, (sheet2csvPiscina.completed * sheet2csvPiscina.runTime.mean) / sheet2csvPiscina.duration)
      this.set({ task: 'geojson2pbf' }, (geojson2pbfPiscina.completed * geojson2pbfPiscina.runTime.mean) / geojson2pbfPiscina.duration)
      this.set({ task: 'fetchDCAT' }, (fetchDCATPiscina.completed * fetchDCATPiscina.runTime.mean) / fetchDCATPiscina.duration)
    }
  })
}
