import type { Db } from 'mongodb'
import { Gauge } from 'prom-client'
import { servicePromRegistry } from '@data-fair/lib-node/observer.js'
import { type Piscina } from 'piscina'

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
}

const taskMetrics: { [key: string]: { completed: number, duration: number } } = {}
const workers: Record<string, Piscina> = {}

export const piscinaGauge = (_workers: Record<string, Piscina>) => {
  Object.assign(workers, _workers)
}

// eslint-disable-next-line no-new
new Gauge({
  name: 'df_threads_utilization',
  help: 'Utilization of worker threads',
  labelNames: ['task'],
  async collect () {
    for (const [task, piscina] of Object.entries(workers)) {
      // same as "utilization" from piscina but without dividing by maxThreads
      // this way we get an approximation of the CPU usage of the threads
      // also we reset the histogram after each collection
      const completed = piscina.completed - (taskMetrics[task]?.completed ?? 0)
      const duration = piscina.duration - (taskMetrics[task]?.duration ?? 0)
      const value = completed ? ((completed * piscina.histogram.runTime.mean) / duration) : 0
      this.set({ task }, value)
      taskMetrics[task] = { completed: piscina.completed, duration: piscina.duration }
      piscina.histogram.resetRunTime()
    }
  }
})
