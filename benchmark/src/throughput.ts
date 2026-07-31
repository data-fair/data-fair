import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { init, getBaseUrl, getAxios } from './setup.ts'
import { seedDataset } from './seeder.ts'
import { getPreset } from './presets.ts'
import { scenarios, type Scenario } from './scenarios.ts'
import { printResults, saveResults, type ScenarioResult } from './reporter.ts'

async function runScenario (scenario: Scenario, duration: number, connections: number, warmup: number): Promise<ScenarioResult> {
  const url = `${getBaseUrl()}/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`

  const check = await getAxios().get(`/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`)
  if (check.status !== 200) throw new Error(`Pre-check failed for ${scenario.name}: status ${check.status}`)
  console.log(`  pre-check ok: ${check.data.total} total results`)

  if (warmup > 0) {
    console.log(`  warmup (${warmup}s)...`)
    await autocannon({ url, connections, duration: warmup })
  }

  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const result = await autocannon({ url, connections, duration })

  return {
    scenario,
    latency: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99, avg: result.latency.average },
    throughput: { avg: result.requests.average, total: result.requests.total },
    errors: result.errors,
    duration
  }
}

/** `throughput` command — autocannon concurrency test over the GET /lines scenarios. */
export async function runThroughput (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenarios: { type: 'string', default: 'all' },
      duration: { type: 'string', default: '10' },
      connections: { type: 'string', default: '10' },
      warmup: { type: 'string', default: '3' },
      'no-save': { type: 'boolean', default: false }
    }
  })

  const selected = values.scenarios === 'all'
    ? scenarios
    : scenarios.filter(s => values.scenarios!.split(',').includes(s.name))
  if (selected.length === 0) {
    throw new Error(`No matching scenarios. Available: ${scenarios.map(s => s.name).join(', ')}`)
  }

  const duration = parseInt(values.duration!)
  const connections = parseInt(values.connections!)
  const warmup = parseInt(values.warmup!)

  await init()
  await seedDataset(getPreset('small'))
  await seedDataset(getPreset('mixed'))

  const results: ScenarioResult[] = []
  for (const scenario of selected) {
    console.log(`\n[${scenario.name}] ${scenario.description}`)
    try {
      results.push(await runScenario(scenario, duration, connections, warmup))
    } catch (err) {
      console.error(`  FAILED: ${err}`)
    }
  }

  printResults(results)
  if (!values['no-save']) saveResults(results)
}
