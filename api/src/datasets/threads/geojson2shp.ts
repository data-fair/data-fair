import fs from 'fs-extra'
import _config from 'config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { spawn } from 'node:child_process'
import { tmpDir } from '../../datasets/utils/files.ts'
import tmp from 'tmp-promise'

const config = _config as any

type Params = { geojson: string, baseName: string }

export default async (params: Params) => {
  if (config.ogr2ogr.skip) {
    throw httpError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
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
    ogr.stdin.write(params.geojson)
    ogr.stdin.end()
  })
}
