// Load the repo-root .env so the harness auto-discovers the dev environment's
// host/ports. Imported for its side effect by setup.ts and es.ts *before* they
// read process.env. Best-effort: if .env is absent, BENCHMARK_* env vars and
// hardcoded fallbacks still apply.
import path from 'node:path'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'))
} catch {
  // no .env at the repo root — rely on BENCHMARK_* env vars / defaults
}
