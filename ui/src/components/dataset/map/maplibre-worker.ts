// maplibre 6 no longer inlines its worker. It derives the worker URL from its own
// `import.meta.url`, expecting to find `maplibre-gl-worker.mjs` as a sibling — but under a
// bundler that resolves next to our own chunk, where the file does not exist, so the worker
// must be pointed at explicitly. Importing this module is a prerequisite for constructing a
// Map; it is a side effect, so import it for its side effect only, before any Map is created.
//
// `?worker&url` rather than a plain `?url` is load-bearing: maplibre's worker entry imports a
// sibling `maplibre-gl-shared` chunk, and only the `worker` part makes Vite bundle the two
// together. A plain `?url` emits the entry alone, which fails to resolve its import at runtime
// — and it fails only in a production build, where the chunk layout differs from dev.
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
