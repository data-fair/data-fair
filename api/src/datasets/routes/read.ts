// Read/search data and aggregation routes for a dataset (extracted from router.js, phase 6d)
import type { Request, RequestHandler, Router } from 'express'
import mongodb from 'mongodb'
import LinkHeader from 'http-link-header'
import contentDisposition from 'content-disposition'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { reqSession } from '@data-fair/lib-express'
import config from '#config'
import mongo from '#mongo'
import { readDataset, reqDataset } from '../middlewares.ts'
import { apiKeyMiddlewareRead, isRest } from './_common.ts'
import { manageESError } from './_es-error.ts'
import * as permissions from '../../misc/utils/permissions.ts'
import { reqPublicOperation } from '../../misc/utils/permissions.ts'
import * as rateLimiting from '../../misc/utils/rate-limiting.ts'
import * as cacheHeaders from '../../misc/utils/cache-headers.ts'
import applicationKey from '../../misc/utils/application-key.ts'
import * as esUtils from '../es/index.ts'
import { reqEsAbortContext } from '../es/abort.ts'
import { getFlatten } from '../utils/flatten.ts'
import * as geo from '../utils/geo.ts'
import * as tiles from '../utils/tiles.ts'
import * as outputs from '../utils/outputs.ts'
import * as cache from '../../misc/utils/cache.ts'
import * as observe from '../../misc/utils/observe.ts'
import * as findUtils from '../../misc/utils/find.ts'
import { attachQueryHint } from '../../misc/utils/query-advice.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { bufferedSource, type LinesSource } from './lines-source.ts'
import { streamJson, streamCsv, streamGeojson, collect } from './lines-pipeline.ts'
import { nextLinkHref, linkHeaderValue } from './lines-body.ts'

// Formats that can consume a streamed source (serialize row-by-row + res.send). json/csv and geojson
// qualify: each hit maps independently to output (geojson's bbox is a separate agg). shp still needs the
// whole geojson materialized for the zip, vector tiles need all features spatially indexed, and xlsx/ods
// build a sheet from all rows — those stay on the buffered search. When unsure → buffered.
const streamEligible = (query: any): boolean =>
  !query.format || query.format === 'json' || query.format === 'csv' || query.format === 'geojson'

// used later to count items in a tile or tile's neighbor
async function countWithCache (req: Request, db: any, query: any) {
  const dataset = reqDataset(req)
  if (config.cache.disabled) return esUtils.count(dataset, query, reqEsAbortContext(req))
  return cache.getSet({
    type: 'tile-count',
    datasetId: dataset.id,
    finalizedAt: dataset.finalizedAt,
    query
  }, async () => {
    return esUtils.count(dataset, query, reqEsAbortContext(req))
  })
}

// Read/search data for a dataset
const readLines: RequestHandler = async (req, res) => {
  const dataset = reqDataset(req)
  const publicBaseUrl = reqPublicBaseUrl(req)
  observe.reqRouteName(req, `${req.route.path}?format=${req.query.format || 'json'}`)
  observe.reqStep(req, 'middlewares')
  const db = mongo.db
  res.throttleEnd()

  // abort the underlying ES search(es) if the http client goes away + bound them with a read-side
  // requestTimeout (also stored on req.esAbortContext, picked up by countWithCache)
  const esAbortContext = esUtils.createEsRequestOptions(req, res)

  // if the output format is geo make sure geoshape is present
  // also manage a default content for geo tiles
  const query: any = { ...req.query }

  // case of own lines query
  if (req.params.owner) query.owner = req.params.owner

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(query.format)

  let xyz: any
  if (vectorTileRequested) {
    // sorting by rand provides more homogeneous distribution in tiles
    query.sort = query.sort || '_rand'
    if (!query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
    xyz = query.xyz.split(',').map(Number)
  }
  const defaultSampling = (dataset.schema ?? []).find(p => p.key === '_geoshape')?.['x-capabilities']?.vtPrepare ? 'max' : 'neighbors'
  const sampling = query.sampling || defaultSampling
  if (!['max', 'neighbors'].includes(sampling)) return res.status(400).type('text/plain').send('Sampling can be "max" or "neighbors"')

  const geoshapeProp = (dataset.schema ?? []).find(p => p.key === '_geoshape')
  const vtPrepared = vectorTileRequested && xyz[2] <= config.tiles.vtPrepareMaxZoom && geoshapeProp?.['x-capabilities']?.vtPrepare

  // vector tiles have a specific default select to prevent huge tiles
  if (vectorTileRequested && !query.select) {
    query.select = tiles.defaultSelect(dataset).join(',')
  }

  // make sure we have _geoshape and _geopoint for geo formats no matter what is in the select
  if (['geojson', 'mvt', 'vt', 'pbf', 'shp'].includes(query.format) && !vtPrepared) {
    const select = query.select ? query.select.split(',') : (dataset.schema ?? []).filter(p => p.key !== '_geocorners' && p['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry' && p['x-refersTo'] !== 'http://data.ign.fr/def/geometrie#Geometry').map(p => p.key)
    if (!select.includes('_geoshape') && geoshapeProp) {
      select.push('_geoshape')
    } else if (!select.includes('_geopoint')) {
      select.push('_geopoint')
    }
    query.select = select.join(',')
  }

  if (vectorTileRequested) {
    // default is smaller (see es/commons) for other format, but we want filled tiles by default
    if (!('size' in query)) query.size = config.elasticsearch.maxPageSize + ''
    // track_total_hits is expensive and not needed for tile rendering, disable by default
    if (query.count !== 'true') query.count = 'false'
  }

  if (query.format === 'wkt') {
    if (geoshapeProp) query.select = '_geoshape'
    else query.select = '_geopoint'
  }

  observe.reqStep(req, 'prepare')

  // Is the tile cached ?
  let cacheHash: any
  const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && reqPublicOperation(req) && req.query.finalizedAt)
  if (useVTCache) {
    const { hash, value } = await cache.get({
      type: 'tile',
      sampling,
      datasetId: dataset.id,
      finalizedAt: dataset.finalizedAt,
      query
    })
    observe.reqStep(req, 'checkTileCache')
    if (value) {
      res.type('application/x-protobuf')
      res.setHeader('x-tilesmode', 'cache/' + sampling)
      res.throttleEnd('static')
      if (value.count && value.total) res.setHeader('x-tilesampling', value.count + '/' + value.total)
      return res.status(200).send(value.tile ? value.tile.buffer : value.buffer)
    }
    cacheHash = hash
  }

  let tilesMode = 'es/' + sampling
  if (vectorTileRequested) {
    const requestedSize = Number(query.size)
    if (sampling === 'neighbors') {
      // count docs in neighboring tiles to perform intelligent sampling
      try {
        const mainCount = await countWithCache(req, db, query)
        if (mainCount === 0) return res.status(204).send()
        if (mainCount <= requestedSize / 20) {
          // no sampling on low density tiles
          query.size = requestedSize
        } else {
          const neighborsCounts = await Promise.all([
            // the 4 that share an edge
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0], xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0], xyz[1] + 1, xyz[2]].join(',') }),
            // Using corners also yields better results
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] - 1, xyz[1] + 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...query, xyz: [xyz[0] + 1, xyz[1] + 1, xyz[2]].join(',') })
          ])
          const maxCount = Math.max(mainCount, ...neighborsCounts)
          const sampleRate = requestedSize / Math.max(requestedSize, maxCount)
          const sizeFilter = mainCount * sampleRate
          query.size = Math.min(sizeFilter, requestedSize)
        }
      } catch (err) {
        await manageESError(req, err)
      }

      tilesMode += '/' + query.size
      observe.reqStep(req, 'neighborsSampling')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, size] = findUtils.pagination(query)

  // Mode selection: eligible json/csv responses read ES with `asStream` (the splitter parses hits
  // incrementally so the raw response is never held whole), under the experimental flag or the non-prod
  // ?_stream opt-in. The json/csv pipeline serializes rows on the fly and `res.send`s the assembled body, so
  // the source choice (streamed vs the buffered esResponse from search()) is purely internal — it changes
  // peak memory, never the observable response (same Link/ETag/next/Content-Length). Every geo/tile/sheet
  // request (ineligible) stays on the buffered search that yields a concrete esResponse consumed directly by
  // the geo/wkt/tile branches below.
  //
  // TODO (shelved optimization): `res.send` already gives every /lines response a strong ETag + `304`. To
  // also skip the ES query on a cache hit, compute a synthetic validator from what fully determines the body
  // (dataset.finalizedAt + normalized query + shaping params: select/html/thumbnail/truncate/arrays/format),
  // set it as the ETag, and short-circuit `If-None-Match` at the top of readLines — a 304 *before* the query,
  // on top of the existing `finalizedAt`/`Last-Modified` pre-query 304 in the resourceBased middleware.
  const forceStream = process.env.NODE_ENV !== 'production' && query._stream === 'true'
  const streamOn = (config as any).experimental?.streamReadLines === true || forceStream
  const eligible = streamOn && streamEligible(query)
  // `_stream` is an internal, non-prod opt-in — never a public API param. Drop it from the `query` copy
  // once consumed so it does not leak into the `next` pagination link (built from `query`), keeping the
  // streamed link byte-identical to the buffered one. (The hint is kept identical separately: `_stream`
  // is a RECOGNIZED_PARAM so ignoredParamsAdvice never flags it — see misc/utils/query-advice.ts.)
  delete query._stream

  let esResponse: any
  let rawTileBuffer: Buffer | undefined
  let rawShpBuffer: Buffer | undefined
  let rawShpBbox: any
  let streamedSource: LinesSource | undefined
  const esSearchStart = Date.now()
  if (eligible) {
    try {
      streamedSource = await esUtils.searchStream(req.app.get('es'), dataset, query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
  } else if (query.format === 'shp' && !(query.select && query.select.split(',').includes('_attachment_url'))) {
    // Zero-copy shp export path (mirror of the vector-tile zero-copy path): fetch the RAW ES response bytes
    // and hand them (transferred) to the geojson2shp worker, which parses + builds geojson + JSON.stringifies
    // + feeds ogr2ogr — avoiding a main-thread ES parse + structured-clone of the whole geojson object graph.
    // A request that explicitly selects `_attachment_url` stays buffered: search() rewrites that URL
    // (publicUrl→publicBaseUrl + virtual fixup) but the raw worker path has no config/publicBaseUrl to do so,
    // so routing it here would leak the raw stored URL. It falls through to search() below, which rewrites.
    // bbox (a separate aggregation the worker appends to the geojson) is independent of the hits, so the
    // two ES round trips run concurrently.
    try {
      ;[rawShpBuffer, rawShpBbox] = await Promise.all([
        esUtils.searchRaw(req.app.get('es'), dataset, query, esAbortContext),
        esUtils.bboxAgg(dataset, { ...query }, undefined, undefined, esAbortContext).then((r: any) => r.bbox)
      ])
    } catch (err) {
      await manageESError(req, err)
    }
  } else if (vectorTileRequested && !vtPrepared && sampling !== 'max' && !query.collapse &&
    !(query.select && query.select.split(',').includes('_attachment_url'))) {
    // Zero-copy vector-tile path: fetch the RAW ES response bytes and hand them (transferred) to the render
    // worker, which parses + builds geojson + renders. Only the neighbors/non-vtPrepared case — max and
    // vtPrepared stay on the buffered esResponse path below (multi-search concat / `_vt` script_fields).
    // A tile that explicitly selects `_attachment_url` also stays buffered: search() rewrites that URL
    // (publicUrl→publicBaseUrl + virtual fixup) but the raw worker path has no config/publicBaseUrl to do so,
    // so routing it here would leak the raw stored URL. The default tile select excludes `_`-prefixed keys,
    // so this only matters when a caller opts in — rare, and kept correct by falling through to search().
    try {
      rawTileBuffer = await esUtils.searchRaw(req.app.get('es'), dataset, query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
  } else if (vectorTileRequested && sampling === 'max' && !query.collapse) {
    let previousEsResponse
    let totalLength = 0
    for (let i = 0; i < 4; i++) {
      if (previousEsResponse) {
        if (size && previousEsResponse.hits.hits.length === size && totalLength < 10000000) {
          const lastHit = previousEsResponse.hits.hits[previousEsResponse.hits.hits.length - 1]
          query.after = JSON.stringify(lastHit.sort).slice(1, -1)
        } else {
          break
        }
      }
      try {
        previousEsResponse = await esUtils.search(req.app.get('es'), dataset, query, publicBaseUrl, vtPrepared && xyz.join('-'), esAbortContext)
      } catch (err) {
        await manageESError(req, err)
        break
      }
      totalLength += previousEsResponse.contentLength

      if (!esResponse) esResponse = previousEsResponse
      else esResponse.hits.hits = esResponse.hits.hits.concat(previousEsResponse.hits.hits)
    }
  } else {
    try {
      esResponse = await esUtils.search(req.app.get('es'), dataset, query, publicBaseUrl, vtPrepared && xyz.join('-'), esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
  }
  const esSearchDurationMs = Date.now() - esSearchStart
  observe.reqStep(req, 'search')

  // buffered source over the ES response: geo/wkt/tile branches keep consuming esResponse directly,
  // while json/csv/xlsx/ods route through the shared pipeline (streamJson/streamCsv/collect). In streamed
  // mode the source is the incremental one and esResponse stays undefined (never reached by geo/tile).
  // In the zero-copy tile path esResponse stays undefined (the raw bytes go straight to the worker) and the
  // vector-tile branch below returns before `source` is consumed, so skip building a buffered source then.
  const source: LinesSource = streamedSource ?? (esResponse ? bufferedSource(esResponse) : undefined as any)

  // Pagination (search_after) Link header for the HARD formats only: geojson/shp/wkt/tiles read esResponse
  // directly and res.send, so their last hit is known here. json/csv build their own Link header (and, for
  // json, the body `next`) inside the pipeline from the source's last hit — see streamJson/streamCsv — so
  // they are excluded here. https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html
  if (!streamEligible(query) && esResponse && size) {
    const lastHit = esResponse.hits.hits[esResponse.hits.hits.length - 1]
    const href = nextLinkHref({ size, query, publicBaseUrl, datasetId: dataset.id as string }, esResponse.hits.hits.length, lastHit)
    if (href) res.set('Link', linkHeaderValue(href))
  }

  if (query.format === 'geojson') {
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.geojson'))
    res.type('geojson')
    // bbox is an independent aggregation: start it now and let streamGeojson await it after the hits are
    // consumed, so the two ES round trips overlap instead of serializing. The no-op catch prevents an
    // unhandledRejection if bboxAgg fails while the hits are still being consumed — the real await inside
    // streamGeojson still surfaces the error before anything is sent.
    const bboxPromise = esUtils.bboxAgg(dataset, { ...query }, undefined, undefined, esAbortContext).then((r: any) => r.bbox)
    bboxPromise.catch(() => {})
    await streamGeojson(req, res, source, { size, query, publicBaseUrl, datasetId: dataset.id as string, rewriteAttachmentUrl: eligible, bbox: bboxPromise })
    observe.reqStep(req, 'bboxAgg')
    return
  }

  if (query.format === 'shp') {
    // Zero-copy path: the raw ES bytes were transferred to the worker, which parses + builds geojson +
    // appends bbox + JSON.stringifies + feeds ogr2ogr. bbox is a separate agg (independent of the hits) so
    // it's computed here and passed through; the worker appends it LAST, matching the old key order below.
    if (rawShpBuffer) {
      observe.reqStep(req, 'bboxAgg') // ran concurrently with searchRaw in the mode-selection block
      const shpZip = await outputs.geojson2shpFromBuffer(rawShpBuffer, rawShpBbox, dataset.slug as string, dataset)
      observe.reqStep(req, 'geojson2shp')
      res.setHeader('content-disposition', contentDisposition(dataset.slug + '.zip'))
      res.type('zip')
      return res.status(200).send(shpZip)
    }
    // Buffered fallback (the `_attachment_url`-selected case, which the raw worker path can't rewrite — see
    // the mode-selection gate above): search() already rewrote the URL, so materialize the whole geojson here.
    if (!esResponse) return res.status(204).send()
    const flatten = getFlatten(dataset, true)
    const geojson: any = geo.result2geojson(esResponse, flatten)
    observe.reqStep(req, 'result2geojson')
    geojson.bbox = (await esUtils.bboxAgg(dataset, { ...query }, undefined, undefined, esAbortContext)).bbox
    observe.reqStep(req, 'bboxAgg')
    const shpZip = await outputs.geojson2shp(geojson, dataset.slug as string)
    observe.reqStep(req, 'geojson2shp')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.zip'))
    res.type('zip')
    return res.status(200).send(shpZip)
  }

  if (query.format === 'wkt') {
    const wkt = geo.result2wkt(esResponse)
    observe.reqStep(req, 'result2wkt')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.wkt'))
    res.type('text/plain')
    return res.status(200).send(wkt)
  }

  if (vectorTileRequested) {
    // Zero-copy path: the raw ES bytes were transferred to the worker, which parsed + built geojson +
    // rendered and returned count/total so we can reproduce the exact same 204/headers/cache behavior the
    // esResponse path had.
    if (rawTileBuffer) {
      const { tile, count, total } = await tiles.geojson2pbfFromBuffer(rawTileBuffer, xyz, dataset)
      observe.reqStep(req, 'geojson2pbf')
      // 204 = no-content, better than 404
      if (!count) return res.status(204).send()
      res.type('application/x-protobuf')
      // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
      if (useVTCache) cache.set(cacheHash, { tile: new mongodb.Binary(tile), count, total })
      res.setHeader('x-tilesmode', tilesMode)
      if (total != null) res.setHeader('x-tilesampling', count + '/' + total)
      return res.status(200).send(tile)
    }
    if (!esResponse.hits.hits.length) return res.status(204).send()
    const flatten = getFlatten(dataset, true)
    const tile = await tiles.geojson2pbf(geo.result2geojson(esResponse, flatten), xyz, vtPrepared)
    if (vtPrepared) tilesMode += '/prepared'
    observe.reqStep(req, 'geojson2pbf')
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (useVTCache) cache.set(cacheHash, { tile: new mongodb.Binary(tile), count: esResponse.hits.hits.length, total: esResponse.hits.total?.value })
    res.setHeader('x-tilesmode', tilesMode)
    if (esResponse.hits.total) res.setHeader('x-tilesampling', esResponse.hits.hits.length + '/' + esResponse.hits.total.value)
    return res.status(200).send(tile)
  }

  if (query.format === 'csv') {
    observe.reqStep(req, 'streamCsv')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.csv'))
    await streamCsv(req, res, source, { size, query, publicBaseUrl, datasetId: dataset.id as string, rewriteAttachmentUrl: eligible })
    return
  }

  // xlsx/ods cannot be produced incrementally: materialize the rows through the same per-hit transform
  // the buffered path used, then hand them to results2sheet unchanged. Yield to the event loop every
  // 500 items (setImmediate) so a very large xlsx/ods export does not block the event loop more than
  // the pre-refactor path did (pre-refactor code yielded every 500 hits during the per-hit build).
  if (query.format === 'xlsx' || query.format === 'ods') {
    const flatten = getFlatten(dataset, req.query.arrays === 'true')
    const resultCtx = esUtils.prepareResultContext(dataset, query)
    const hits = await collect(source)
    const rows: any[] = []
    for (let i = 0; i < hits.length; i++) {
      if (i % 500 === 499) await new Promise(resolve => setImmediate(resolve))
      rows.push(esUtils.prepareResultItem(hits[i], dataset, query, flatten, publicBaseUrl, resultCtx))
    }
    observe.reqStep(req, 'prepareResultItems')
    if (query.format === 'xlsx') {
      const sheet = await outputs.results2sheet(req as outputs.ReqWithDataset, rows)
      observe.reqStep(req, 'results2xlsx')
      res.setHeader('content-disposition', contentDisposition(dataset.slug + '.xlsx'))
      res.type('xlsx')
      return res.status(200).send(sheet)
    }
    const sheet = await outputs.results2sheet(req as outputs.ReqWithDataset, rows, 'ods')
    observe.reqStep(req, 'results2ods')
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.ods'))
    res.type('ods')
    return res.status(200).send(sheet)
  }

  observe.reqStep(req, 'streamJson')
  await streamJson(req, res, source, {
    publicBaseUrl,
    datasetId: dataset.id as string,
    size,
    query,
    esSearchDurationMs,
    // eligible ⇒ source came from searchStream (raw _attachment_url) ⇒ rewrite in prepareResultItem;
    // otherwise it came from search() which already rewrote it
    rewriteAttachmentUrl: eligible
  })
}

export const registerReadRoutes = (router: Router) => {
  router.get('/:datasetId/lines', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readLines', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), readLines)
  router.get('/:datasetId/own/:owner/lines', readDataset({ fillDescendants: true }), isRest, applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('readOwnLines', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readLines)

  // Special geo aggregation
  router.get('/:datasetId/geo_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getGeoAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    const query: any = req.query
    res.throttleEnd()

    const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(query.format)
    // Is the tile cached ?
    let cacheHash: any
    const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && reqPublicOperation(req) && query.finalizedAt)
    if (useVTCache) {
      const { hash, value } = await cache.get({
        type: 'tile-geoagg',
        datasetId: dataset.id,
        finalizedAt: dataset.finalizedAt,
        query
      })
      if (value) return res.status(200).send(value.buffer)
      cacheHash = hash
    }
    let result: any
    const flatten = getFlatten(dataset, query.arrays === 'true')
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    const esGeoAggStart = Date.now()
    try {
      result = await esUtils.geoAgg(req.app.get('es'), dataset, query, reqPublicBaseUrl(req), flatten, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    const esGeoAggDurationMs = Date.now() - esGeoAggStart

    if (query.format === 'geojson') {
      const geojson: any = geo.aggs2geojson(result)
      geojson.bbox = (await esUtils.bboxAgg(dataset, { ...query }, undefined, undefined, esAbortContext)).bbox
      return res.status(200).send(geojson)
    }

    if (vectorTileRequested) {
      if (!query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
      const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), query.xyz.split(',').map(Number))
      // 204 = no-content, better than 404
      if (!tile) return res.status(204).send()
      res.type('application/x-protobuf')
      // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
      if (useVTCache) cache.set(cacheHash, new mongodb.Binary(tile))
      return res.status(200).send(tile)
    }

    result = attachQueryHint(req, esGeoAggDurationMs, result)
    res.status(200).send(result)
  })

  // Standard aggregation to group items by value and perform an optional metric calculation on each group
  router.get('/:datasetId/values_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getValuesAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    const query: any = req.query
    res.throttleEnd()
    const sessionState = reqSession(req)

    const explain: any = query.explain === 'true' && sessionState.user && (sessionState.user.isAdmin || sessionState.user.asAdmin) ? {} : null

    const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(query.format)
    const useVTCache = vectorTileRequested && !config.cache.disabled && !(config.cache.reverseProxyCache && reqPublicOperation(req) && query.finalizedAt)
    // Is the tile cached ?
    let cacheHash: any
    if (vectorTileRequested && useVTCache) {
      const { hash, value } = await cache.get({
        type: 'tile-valuesagg',
        datasetId: dataset.id,
        finalizedAt: dataset.finalizedAt,
        query
      })
      if (value) return res.status(200).send(value.buffer)
      cacheHash = hash
    }

    let result: any
    const flatten = getFlatten(dataset, query.arrays === 'true')
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    const esValuesAggStart = Date.now()
    try {
      result = await esUtils.valuesAgg(dataset, { ...query }, vectorTileRequested || query.format === 'geojson', reqPublicBaseUrl(req), explain, flatten, undefined, undefined, esAbortContext)
      if (result.next) {
        const nextLinkURL = new URL(`${reqPublicBaseUrl(req)}/api/v1/datasets/${dataset.id}/values_agg`)
        for (const key of Object.keys(query)) {
          nextLinkURL.searchParams.set(key, query[key])
        }
        for (const key of Object.keys(result.next)) {
          nextLinkURL.searchParams.set(key, result.next[key])
        }
        const link = new LinkHeader()
        link.set({ rel: 'next', uri: nextLinkURL.href })
        res.set('Link', link.toString())
        result.next = nextLinkURL.href
      }
    } catch (err) {
      await manageESError(req, err)
    }
    const esValuesAggDurationMs = Date.now() - esValuesAggStart

    if (query.format === 'geojson') {
      const geojson: any = geo.aggs2geojson(result)
      geojson.bbox = (await esUtils.bboxAgg(dataset, { ...query }, undefined, undefined, esAbortContext)).bbox
      return res.status(200).send(geojson)
    }

    if (vectorTileRequested) {
      if (!query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
      const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), query.xyz.split(',').map(Number))
      // 204 = no-content, better than 404
      if (!tile) return res.status(204).send()
      res.type('application/x-protobuf')
      // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
      if (useVTCache) cache.set(cacheHash, new mongodb.Binary(tile))
      return res.status(200).send(tile)
    }

    if (explain) result.explain = explain

    result = attachQueryHint(req, esValuesAggDurationMs, result)
    res.status(200).send(result)
  })

  // Simpler values list and filter (q is applied only to the selected field, not all fields)
  // mostly useful for selects/autocompletes on values
  router.get('/:datasetId/values/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    res.throttleEnd()
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.values(req.app.get('es'), dataset, req.params.fieldKey as string, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    res.status(200).send(result)
  })

  // Same as previous, but also uses x-labels for a better experience
  router.get('/:datasetId/values-labels/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    res.throttleEnd()
    let result
    const field: any = (dataset.schema ?? []).find(p => p.key === req.params.fieldKey)
    if (!field) throw httpError(400, `field "${req.params.fieldKey}" is unknown`)
    if (field['x-labels'] && field['x-labelsRestricted']) {
      result = Object.entries(field['x-labels']).map(([value, label]) => ({ value, label }))
    } else {
      req.query.size = req.query.size ?? '1000'
      const esAbortContext = esUtils.createEsRequestOptions(req, res)
      try {
        const values = await esUtils.values(req.app.get('es'), dataset, req.params.fieldKey as string, req.query, esAbortContext)
        result = values.map((value: any) => ({ value, label: field['x-labels']?.[value] ?? value }))
      } catch (err) {
        await manageESError(req, err)
      }
    }
    res.status(200).send(result)
  })

  // Simple metric aggregation to calculate 1 value (sum, avg, etc.) about 1 column
  router.get('/:datasetId/metric_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getMetricAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    res.throttleEnd()
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.metricAgg(req.app.get('es'), dataset, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    // correctness hint only (metric_agg does not time the ES step); perf advice stays off at duration 0
    result = attachQueryHint(req, 0, result)
    res.status(200).send(result)
  })

  // Simple metric aggregation to calculate some basic values about a list of columns
  router.get('/:datasetId/simple_metrics_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getSimpleMetricsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    res.throttleEnd()
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.simpleMetricsAgg(req.app.get('es'), dataset, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    res.status(200).send(result)
  })

  // Simple words aggregation for significant terms extraction
  router.get('/:datasetId/words_agg', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getWordsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    res.throttleEnd()
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.wordsAgg(req.app.get('es'), dataset, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    res.status(200).send(result)
  })

  // DEPRECATED, replaced by metric_agg
  // Get max value of a field
  router.get('/:datasetId/max/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getMaxAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.maxAgg(dataset, req.params.fieldKey as string, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    res.status(200).send(result)
  })

  // DEPRECATED, replaced by metric_agg
  // Get min value of a field
  router.get('/:datasetId/min/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, apiKeyMiddlewareRead, rateLimiting.middleware, permissions.middleware('getMinAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), async (req, res) => {
    const dataset = reqDataset(req)
    const esAbortContext = esUtils.createEsRequestOptions(req, res)
    let result
    try {
      result = await esUtils.minAgg(dataset, req.params.fieldKey as string, req.query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
    res.status(200).send(result)
  })
}
