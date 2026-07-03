import fs from 'fs-extra'
import _config from 'config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { spawn } from 'node:child_process'
import { tmpDir } from '../../datasets/utils/files.ts'
import { rawEsBuffer2geojson } from '../../datasets/utils/geo-features.ts'
import tmp from 'tmp-promise'

const config = _config as any

type Params = { geojson?: string, rawBuffer?: Uint8Array, bbox?: any, baseName: string, dataset?: any }

export default async (params: Params) => {
  if (config.ogr2ogr.skip) {
    throw httpError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
  }

  // Zero-copy raw-buffer path (mirror of geojson2pbf's rawBuffer branch): the main thread transferred the
  // raw ES response bytes here — parse them, build geojson (rawEsBuffer2geojson is config-free, safe in a
  // worker) then JSON.stringify with bbox appended LAST. This yields a string byte-identical to the old
  // main-thread `JSON.stringify({ ...result2geojson(esResponse, flatten), bbox })`, so ogr2ogr's input (and
  // thus the shapefile) is unchanged.
  let geojsonStr: string
  if (params.rawBuffer) {
    const { geojson } = rawEsBuffer2geojson(params.rawBuffer, params.dataset)
    geojson.bbox = params.bbox // appended LAST — matches the old main-thread key order (type/total/features/bbox)
    geojsonStr = JSON.stringify(geojson)
  } else {
    geojsonStr = params.geojson as string
  }

  const tmpD = (await tmp.tmpName({ prefix: 'geojson2shp-', tmpdir: tmpDir }))
  await fs.ensureDir(tmpD)
  const tmpFile = `${tmpD}/${params.baseName}.shz`

  const opts: string[] = [
    '-lco', 'ENCODING=UTF-8',
    '-f', 'ESRI Shapefile', tmpFile,
    // read from stdin
    // we also tried to write to stdout but it doesn't work as shapefile output is not sequential
    '/vsistdin/'
  ]

  const ogr = spawn('ogr2ogr', opts)
  return await new Promise((resolve, reject) => {
    ogr.stderr.on('data', (data) => {
      console.warn('grojson2shp stderr', data.toString())
    })
    ogr.on('close', async (code) => {
      if (code === 0) {
        try {
          resolve(await fs.readFile(tmpFile))
        } catch (err) {
          reject(err)
        }
      } else {
        reject(new Error(`ogr2ogr exited with code ${code}`))
      }
      try {
        await fs.remove(tmpD)
      } catch (err) {}
    })
    ogr.stdin.write(geojsonStr)
    ogr.stdin.end()
  })
}
