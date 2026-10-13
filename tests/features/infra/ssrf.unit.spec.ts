import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { applyPrivateMapping } from '../../../api/src/misc/utils/private-mapping.ts'
import { getOgrInputOptions, getOgrEnv } from '../../../api/src/misc/utils/ogr.ts'

test.describe('applyPrivateMapping', () => {
  const remoteServicesMapping = ['https://koumoul.com/s/', 'http://taxman-cache:80/']
  const applicationsMapping = ['https://koumoul.com/apps/', 'http://nginx-static:80/apps/']

  test('maps urls under the public prefix like the production configuration', () => {
    // the default port is dropped by URL normalization, same address
    assert.equal(applyPrivateMapping('https://koumoul.com/s/geocoder/api/v1', remoteServicesMapping), 'http://taxman-cache/geocoder/api/v1')
    assert.equal(applyPrivateMapping('https://koumoul.com/apps/charts/0.12', applicationsMapping), 'http://nginx-static/apps/charts/0.12')
    assert.equal(applyPrivateMapping('https://koumoul.com/apps/charts/0.12/?a=b', applicationsMapping), 'http://nginx-static/apps/charts/0.12/?a=b')
  })

  test('does not map other urls', () => {
    assert.equal(applyPrivateMapping('https://other.com/s/geocoder', remoteServicesMapping), undefined)
    assert.equal(applyPrivateMapping('https://koumoul.com/sirene/api', remoteServicesMapping), undefined)
    assert.equal(applyPrivateMapping('http://koumoul.com/s/geocoder', remoteServicesMapping), undefined)
    assert.equal(applyPrivateMapping('https://koumoul.com.evil.com/s/geocoder', remoteServicesMapping), undefined)
    assert.equal(applyPrivateMapping('not an url', remoteServicesMapping), undefined)
  })

  test('is disabled by the default empty mapping', () => {
    assert.equal(applyPrivateMapping('https://koumoul.com/s/geocoder', ['', '']), undefined)
    assert.equal(applyPrivateMapping('https://koumoul.com/s/geocoder', undefined), undefined)
  })

  test('never lets a path inject an authority in the private url', () => {
    // a string replace would give http://taxman-cache@169.254.169.254/latest
    const mapped = applyPrivateMapping('https://koumoul.com/s@169.254.169.254/latest', ['https://koumoul.com/s', 'http://taxman-cache'])
    assert.equal(mapped, undefined)
    const mappedRoot = applyPrivateMapping('https://koumoul.com/@169.254.169.254/latest', ['https://koumoul.com', 'http://taxman-cache'])
    assert.equal(new URL(mappedRoot as string).host, 'taxman-cache')
  })
})

test.describe('getOgrInputOptions', () => {
  test('restricts ogr2ogr to the drivers of the expected type', () => {
    assert.deepEqual(getOgrInputOptions({ shapefile: '/tmp/a.shp', mimetype: 'application/zip' }), ['-if', 'ESRI Shapefile'])
    assert.deepEqual(getOgrInputOptions({ mapinfo: '/tmp/a.tab', mimetype: 'application/zip' }), ['-if', 'MapInfo File'])
    assert.deepEqual(getOgrInputOptions({ mimetype: 'application/vnd.google-earth.kml+xml' }), ['-if', 'KML', '-if', 'LIBKML'])
    assert.deepEqual(getOgrInputOptions({ mimetype: 'application/gpx+xml' }), ['-if', 'GPX'])
    assert.deepEqual(getOgrInputOptions({ mimetype: 'application/geopackage+sqlite3' }), ['-if', 'GPKG'])
  })

  test('refuses unknown types instead of letting GDAL sniff the content', () => {
    assert.throws(() => getOgrInputOptions({ mimetype: 'application/xml' }), /no GDAL driver/)
  })
})

test.describe('getOgrEnv', () => {
  test('keeps what GDAL needs and drops the secrets of the worker', () => {
    const env = getOgrEnv({
      PATH: '/usr/bin',
      GDAL_DATA: '/usr/share/gdal',
      PROJ_DATA: '/usr/share/proj',
      CPL_DEBUG: 'OFF',
      MONGO_URL: 'mongodb://user:password@mongo:27017/data-fair',
      S3_SECRET_KEY: 'secret',
      SECRET_IDENTITIES: 'secret',
      NODE_OPTIONS: '--max-old-space-size=1000'
    })
    assert.deepEqual(env, { PATH: '/usr/bin', GDAL_DATA: '/usr/share/gdal', PROJ_DATA: '/usr/share/proj', CPL_DEBUG: 'OFF' })
  })
})
