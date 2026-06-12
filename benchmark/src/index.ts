import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { init, seedDatasets } from './setup.ts'
import { scenarios, buildContext, type HttpScenario, type OneShotScenario } from './scenarios.ts'
import { printResults, saveResults, type ScenarioResult, type HttpScenarioResult, type OneShotScenarioResult } from './reporter.ts'

const { values: args } = parseArgs({
  options: {
    scenarios: { type: 'string', default: 'reads' },
    duration: { type: 'string', default: '10' },
    connections: { type: 'string', default: '10' },
    warmup: { type: 'string', default: '3' },
    repetitions: { type: 'string' },
    'no-save': { type: 'boolean', default: false }
  }
})

// groups: 'reads' = all http GET scenarios, 'writes' = all oneshot + http write scenarios, 'all' = everything
const isWrite = (s: typeof scenarios[0]) => s.kind === 'oneshot' || s.name.includes('write')
const selectedNames = args.scenarios === 'all'
  ? scenarios.map(s => s.name)
  : args.scenarios === 'reads'
    ? scenarios.filter(s => !isWrite(s)).map(s => s.name)
    : args.scenarios === 'writes'
      ? scenarios.filter(isWrite).map(s => s.name)
      : args.scenarios!.split(',')

const selectedScenarios = scenarios.filter(s => selectedNames.includes(s.name))
if (selectedScenarios.length === 0) {
  console.error(`No matching scenarios. Available: ${scenarios.map(s => s.name).join(', ')} (or groups: reads, writes, all)`)
  process.exit(1)
}

const duration = parseInt(args.duration!)
const connections = parseInt(args.connections!)
const warmupDuration = parseInt(args.warmup!)

async function runHttpScenario (scenario: HttpScenario, ctx: ReturnType<typeof buildContext>): Promise<HttpScenarioResult> {
  if (scenario.prepare) await scenario.prepare(ctx)
  const spec = scenario.request(ctx)
  const url = ctx.baseUrl + spec.path

  // probe with the exact same request shape autocannon will send
  const probe = await ctx.anonAxios.request({
    url: spec.path,
    method: spec.method ?? 'GET',
    headers: spec.headers,
    data: spec.body
  })
  const expected = scenario.expectStatus ?? 200
  if (probe.status !== expected) {
    throw new Error(`Pre-check failed for ${scenario.name}: status ${probe.status} (expected ${expected})`)
  }

  const opts = {
    url,
    connections,
    method: (spec.method ?? 'GET') as 'GET' | 'POST' | 'PUT',
    headers: spec.headers,
    body: spec.body,
    idReplacement: spec.idReplacement
  }

  if (warmupDuration > 0) {
    console.log(`  warmup (${warmupDuration}s)...`)
    await autocannon({ ...opts, duration: warmupDuration })
  }

  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const result = await autocannon({ ...opts, duration })

  return {
    kind: 'http',
    name: scenario.name,
    description: scenario.description,
    latency: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99, avg: result.latency.average },
    throughput: { avg: result.requests.average, total: result.requests.total },
    errors: result.errors,
    non2xx: result.non2xx,
    duration
  }
}

async function runOneShotScenario (scenario: OneShotScenario, ctx: ReturnType<typeof buildContext>): Promise<OneShotScenarioResult> {
  const repetitions = args.repetitions ? parseInt(args.repetitions) : (scenario.repetitions ?? 1)
  const metrics: Record<string, number[]> = {}
  for (let rep = 0; rep < repetitions; rep++) {
    if (scenario.prepare) {
      console.log(`  rep ${rep + 1}/${repetitions}: preparing...`)
      await scenario.prepare(ctx)
    }
    console.log(`  rep ${rep + 1}/${repetitions}: running...`)
    const m = await scenario.run(ctx)
    for (const [key, value] of Object.entries(m)) {
      (metrics[key] = metrics[key] || []).push(value)
    }
  }
  return { kind: 'oneshot', name: scenario.name, description: scenario.description, repetitions, metrics }
}

async function main () {
  console.log('Starting benchmark...')
  console.log(`Scenarios: ${selectedScenarios.map(s => s.name).join(', ')}`)
  console.log(`Duration: ${duration}s, Connections: ${connections}, Warmup: ${warmupDuration}s`)
  console.log('')

  await init()
  await seedDatasets()
  const ctx = buildContext()

  const results: ScenarioResult[] = []
  for (const scenario of selectedScenarios) {
    console.log(`\n[${scenario.name}] ${scenario.description}`)
    try {
      const result = scenario.kind === 'http'
        ? await runHttpScenario(scenario, ctx)
        : await runOneShotScenario(scenario, ctx)
      results.push(result)
    } catch (err) {
      console.error(`  FAILED: ${err}`)
    }
  }

  printResults(results)
  if (!args['no-save']) saveResults(results)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
