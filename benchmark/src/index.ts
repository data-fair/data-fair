import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { init, seedDatasets, getBaseUrl, getAxios } from './setup.ts'
import { scenarios } from './scenarios.ts'
import { printResults, saveResults, type ScenarioResult } from './reporter.ts'

const { values: args } = parseArgs({
  options: {
    scenarios: { type: 'string', default: 'all' },
    duration: { type: 'string', default: '10' },
    connections: { type: 'string', default: '10' },
    warmup: { type: 'string', default: '3' },
    'no-save': { type: 'boolean', default: false }
  }
})

const selectedNames = args.scenarios === 'all'
  ? scenarios.map(s => s.name)
  : args.scenarios!.split(',')

const selectedScenarios = scenarios.filter(s => selectedNames.includes(s.name))
if (selectedScenarios.length === 0) {
  console.error(`No matching scenarios. Available: ${scenarios.map(s => s.name).join(', ')}`)
  process.exit(1)
}

const duration = parseInt(args.duration!)
const connections = parseInt(args.connections!)
const warmupDuration = parseInt(args.warmup!)

async function runScenario (scenario: typeof scenarios[0]): Promise<ScenarioResult> {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`

  // Verify the endpoint works before benchmarking
  const ax = getAxios()
  const check = await ax.get(`/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`)
  if (check.status !== 200) {
    throw new Error(`Pre-check failed for ${scenario.name}: status ${check.status}`)
  }
  console.log(`  pre-check ok: ${check.data.total} total results`)

  // Warmup
  if (warmupDuration > 0) {
    console.log(`  warmup (${warmupDuration}s)...`)
    await autocannon({ url, connections, duration: warmupDuration })
  }

  // Benchmark
  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const result = await autocannon({ url, connections, duration })

  return {
    scenario,
    latency: {
      p50: result.latency.p50,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      avg: result.latency.average
    },
    throughput: {
      avg: result.requests.average,
      total: result.requests.total
    },
    errors: result.errors,
    duration
  }
}

async function main () {
  console.log('Starting benchmark...')
  console.log(`Scenarios: ${selectedScenarios.map(s => s.name).join(', ')}`)
  console.log(`Duration: ${duration}s, Connections: ${connections}, Warmup: ${warmupDuration}s`)
  console.log('')

  await init()
  await seedDatasets()

  const results: ScenarioResult[] = []

  for (const scenario of selectedScenarios) {
    console.log(`\n[${scenario.name}] ${scenario.description}`)
    try {
      const result = await runScenario(scenario)
      results.push(result)
    } catch (err) {
      console.error(`  FAILED: ${err}`)
    }
  }

  printResults(results)

  if (!args['no-save']) {
    saveResults(results)
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
