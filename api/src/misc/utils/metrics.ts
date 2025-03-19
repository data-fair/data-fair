import type { Db } from 'mongodb'
import { Gauge } from 'prom-client'
import { servicePromRegistry } from '@data-fair/lib-node/observer.js'
// @ts-ignore
import memoizeeProfile from 'memoizee/profile.js'

export const init = async (db: Db) => {
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

  const tasks: { [key: string]: { completed: number, duration: number } } = {}

  // eslint-disable-next-line no-new
  new Gauge({
    name: 'df_threads_utilization',
    help: 'Utilization of worker threads',
    labelNames: ['task'],
    async collect () {
      const piscinas = {
        results2sheet: (await import('../../datasets/utils/outputs.js')).results2sheetPiscina,
        sheet2csv: (await import('../../datasets/utils/rest.js')).sheet2csvPiscina,
        geojson2pbf: (await import('../../datasets/utils/tiles.js')).geojson2pbfPiscina,
        fetchDCAT: (await import('../../catalogs/plugins/dcat.js')).fetchDCATPiscina
      }

      for (const [task, piscina] of Object.entries(piscinas)) {
        // same as "utilization" from piscina but without dividing by maxThreads
        // this way we get an approximation of the CPU usage of the threads
        // also we reset the histogram after each collection
        const completed = piscina.completed - (tasks[task]?.completed ?? 0)
        const duration = piscina.duration - (tasks[task]?.duration ?? 0)
        const value = completed ? ((completed * piscina.histogram.runTime.mean) / duration) : 0
        this.set({ task }, value)
        tasks[task] = { completed: piscina.completed, duration: piscina.duration }
        piscina.histogram.resetRunTime()
      }
    }
  })

  // eslint-disable-next-line no-new
  new Gauge({
    name: 'df_memoize_total',
    help: 'Total number of memoized function uses',
    labelNames: ['fn', 'status'],
    async collect () {
      for (const [key, stats] of Object.entries(memoizeeProfile.statistics)) {
        const name = key.split(', ')[0]
        this.labels({ fn: name, status: 'miss' }).set((stats as { initial: number }).initial)
        this.labels({ fn: name, status: 'hit' }).set((stats as { cached: number }).cached)
      }
    }
  })
}
