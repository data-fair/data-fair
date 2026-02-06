// this is run in a thread as it is quite cpu and memory intensive
import { readFile, unlink } from 'node:fs/promises'
import _config from 'config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { spawn } from 'node:child_process'
import { tmpDir } from '../../datasets/utils/files.ts'
import tmp from 'tmp-promise'

const config = _config as any

export default async (geojsonStr: string) => {
  if (config.ogr2ogr.skip) {
    throw httpError(400, '[noretry] Les fichiers de type shapefile ne sont pas supportés sur ce service.')
  }
  const tmpFile = (await tmp.tmpName({ prefix: 'geojson2shp-', tmpdir: tmpDir })) + '.shp.zip'

  const opts: string[] = [
    '-lco', 'ENCODING=UTF-8',
    '-f', 'ESRI Shapefile', tmpFile,
    // read from stdin
    // we also tried to write to stdout but it doesn't work as shapefile output is not sequential
    '/vsistdin/'
  ]

  const ogr = spawn('ogr2ogr', opts)
  return await new Promise((resolve, reject) => {
    ogr.on('close', async (code) => {
      if (code === 0) {
        try {
          resolve(await readFile(tmpFile))
        } catch (err) {
          reject(err)
        }
      } else {
        reject(new Error(`ogr2ogr exited with code ${code}`))
      }
      try {
        await unlink(tmpFile)
      } catch (err) {}
    })
    ogr.stdin.write(geojsonStr)
    ogr.stdin.end()
  })
}
