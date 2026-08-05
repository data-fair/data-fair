import { parseArgs } from 'node:util'
import { init, getAxios } from './setup.ts'
import { presets, getPreset } from './presets.ts'
import { seedDataset } from './seeder.ts'
import { resolveIndex, reindexWithShards } from './es.ts'
import { selectExperiments, experimentContext, type ExperimentSetup } from './experiments.ts'
import { runQuery } from './runner.ts'
import { aggregate } from './metrics.ts'
import { runThroughput } from './throughput.ts'
import {
  printExperimentReport, saveExperimentResults,
  type ExperimentResult, type VariantResult
} from './reporter.ts'

const USAGE = `data-fair benchmark — Elasticsearch query evaluation harness

Usage: npm run benchmark -- <command> [options]

Commands:
  seed        Generate & idempotently load datasets
              --preset=<all|name,...>  --rows=<n>  --shards=<n>  --seed=<n>
  experiment  Raw-ES A/B: baseline vs. variant query bodies
              --name=<all|experiment|group>  --runs=<n>  --rows=<n>  --profile  --cold  --no-save
              --no-seed  (skip API auth & seeding — requires an already-seeded index)
  query       Run a real data-fair API request N times
              --dataset=<id>  --params=<querystring>  --runs=<n>
  throughput  Autocannon concurrency test over GET /lines
              --scenarios=<all|name,...>  --duration=<s>  --connections=<n>  --warmup=<s>  --no-save

Presets: ${Object.keys(presets).join(', ')}`

async function seedCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      preset: { type: 'string', default: 'all' },
      rows: { type: 'string' },
      shards: { type: 'string' },
      seed: { type: 'string' }
    }
  })
  await init()
  const names = values.preset === 'all' ? Object.keys(presets) : values.preset!.split(',')
  for (const name of names) {
    const spec = getPreset(name)
    if (values.rows) spec.rows = parseInt(values.rows)
    if (values.seed) spec.seed = parseInt(values.seed)
    if (values.shards) spec.shards = parseInt(values.shards)
    await seedDataset(spec)
    if (spec.shards) {
      const index = await resolveIndex(spec.id)
      const copy = await reindexWithShards(index, spec.shards)
      console.log(`[seed] ${spec.id}: ${spec.shards}-shard copy ready at ${copy}`)
    }
  }
}

async function experimentCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string', default: 'all' },
      runs: { type: 'string', default: '10' },
      rows: { type: 'string' },
      profile: { type: 'boolean', default: false },
      cold: { type: 'boolean', default: false },
      'no-save': { type: 'boolean', default: false },
      // the experiments are raw-ES A/B — with an already-seeded index they don't
      // need the web stack (nginx / simple-directory / API) at all
      'no-seed': { type: 'boolean', default: false }
    }
  })
  const selected = selectExperiments(values.name!)
  // self-building experiments (own mappings per variant) never touch the web stack
  const needsApi = !values['no-seed'] && selected.some(e => !e.setup)
  if (needsApi) await init()
  const results: ExperimentResult[] = []
  for (const exp of selected) {
    let setup: ExperimentSetup | undefined
    let index = ''
    let rows: number
    if (exp.setup) {
      setup = await exp.setup(values.rows ? parseInt(values.rows) : undefined)
      rows = setup.rows
    } else {
      const spec = getPreset(exp.preset!)
      if (values.rows) spec.rows = parseInt(values.rows)
      if (!values['no-seed']) await seedDataset(spec)
      index = await resolveIndex(spec.id)
      rows = spec.rows
    }
    const ctx = experimentContext(exp)
    const variants = [
      { ...exp.baseline, isBaseline: true },
      ...exp.variants.map(v => ({ ...v, isBaseline: false }))
    ]
    console.log(`\n[experiment] ${exp.name}`)
    const variantResults: VariantResult[] = []
    for (const v of variants) {
      console.log(`  running variant: ${v.name}`)
      const variantIndex = setup ? setup.indexes[v.name] : index
      if (!variantIndex) throw new Error(`${exp.name}: setup provided no index for variant "${v.name}"`)
      const result = await runQuery({
        index: variantIndex,
        body: v.body(ctx),
        runs: parseInt(values.runs!),
        cold: values.cold,
        profile: values.profile,
        samplerProbability: v.samplerProbability
      })
      variantResults.push({ variant: v.name, description: v.description, isBaseline: v.isBaseline, result })
    }
    const er: ExperimentResult = {
      experiment: exp.name,
      description: exp.description,
      preset: exp.preset ?? 'self-built',
      rows,
      variants: variantResults,
      findings: setup?.findings
    }
    printExperimentReport(er)
    results.push(er)
  }
  if (!values['no-save']) saveExperimentResults(results)
}

async function queryCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dataset: { type: 'string' },
      params: { type: 'string', default: '' },
      runs: { type: 'string', default: '10' }
    }
  })
  if (!values.dataset) throw new Error('query: --dataset is required')
  await init()
  const ax = getAxios()
  const runs = parseInt(values.runs!)
  const url = `/api/v1/datasets/${values.dataset}/lines?${values.params}`
  const latencies: number[] = []
  let total = 0
  let bytes = 0
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    const res = await ax.get(url)
    latencies.push(performance.now() - t0)
    total = res.data.total
    bytes = Buffer.byteLength(JSON.stringify(res.data))
  }
  const e2e = aggregate(latencies)
  console.log('')
  console.log(`Query: GET ${url}`)
  console.log(`runs=${runs}  total=${total}  bytes=${bytes}`)
  console.log(`e2e latency (ms): p50=${e2e.median.toFixed(1)}  min=${e2e.min.toFixed(1)}  max=${e2e.max.toFixed(1)}`)
}

async function main (): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  switch (command) {
    case 'seed': await seedCommand(rest); break
    case 'experiment': await experimentCommand(rest); break
    case 'query': await queryCommand(rest); break
    case 'throughput': await runThroughput(rest); break
    default: console.log(USAGE)
  }
}

// Exit explicitly: axiosAuth keeps a token-refresh timer running, so the process
// would otherwise hang after the command's work is done.
main().then(
  () => process.exit(0),
  (err) => {
    console.error('Benchmark failed:', err)
    process.exit(1)
  }
)
