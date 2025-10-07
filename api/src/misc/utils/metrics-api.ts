// @ts-ignore
import memoizeeProfile from 'memoizee/profile.js'
import { Gauge } from 'prom-client'
import { piscinaGauge } from './metrics.ts'
import { results2sheetPiscina } from '../../datasets/utils/outputs.js'
import { sheet2csvPiscina } from '../../datasets/utils/rest.ts'
import { geojson2pbfPiscina } from '../../datasets/utils/tiles.ts'

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

piscinaGauge({
  results2sheet: results2sheetPiscina,
  sheet2csv: sheet2csvPiscina,
  geojson2pbf: geojson2pbfPiscina,
})
