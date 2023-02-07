const fs = require('fs-extra')
const path = require('path')
const sharp = require('sharp')
const pipeline = require('stream/promises').pipeline
const dayjs = require('dayjs')
const tmp = require('tmp-promise')
const { Binary } = require('mongodb')
const config = require('config')
const axios = require('./axios')

const debug = require('debug')('thumbnails')
const dataDir = path.resolve(config.dataDir)

const getCacheEntry = async (db, url, filePath, sharpOptions) => {
  const cacheFilter = { url, ...sharpOptions }
  debug('get thumbnail', cacheFilter)

  const cacheEntry = await db.collection('thumbnails-cache').findOne(cacheFilter)
  if (cacheEntry && dayjs().diff(cacheEntry.lastUpdated, 'hour', true) < 1) {
    debug('found fresh cache entry', cacheEntry.lastUpdated)
    return cacheEntry
  }
  const newCacheEntry = { ...cacheFilter, lastUpdated: new Date() }
  let tmpFile
  if (!filePath) {
    tmpFile = filePath = await tmp.tmpName({ dir: path.join(dataDir, 'tmp') })
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(filePath)
    try {
      const headers = {}
      if (cacheEntry) {
        if (cacheEntry.lastModified) headers['if-modified-since'] = cacheEntry.lastModified
        if (cacheEntry.etag) headers['if-none-match'] = cacheEntry.etag
        debug('attempt to refresh cache content', headers)
      }
      debug('download image into tmp file')
      const response = await axios({ url, responseType: 'stream', headers })
      await pipeline(response.data, fs.createWriteStream(filePath))
      debug('fetch of image is ok', response.headers)
      newCacheEntry.lastModified = response.headers['last-modified']
      newCacheEntry.etag = response.headers.etag
    } catch (err) {
      // content did not change
      if (err.status === 304) {
        await debug(`image was not modified since last fetch ${url}`)
        await db.collection('thumbnails-cache').updateOne(cacheFilter, { $set: { lastUpdated: new Date() } })
        return cacheEntry
      } else {
        if (cacheEntry) {
          console.warn(`failed to fetch image for thumbnail "${url}", use stale cache entry`, err)
          return cacheEntry
        } else {
          throw err
        }
      }
    }
  } else {
    newCacheEntry.lastModified = (await fs.stat(filePath)).mtime.toUTCString()()
  }
  const fullSharpOptions = {
    ...sharpOptions,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: true
  }
  debug('resize using sharp', fullSharpOptions)
  newCacheEntry.data = Binary(await sharp(filePath)
    .resize(fullSharpOptions)
    .toBuffer())
  if (tmpFile) await fs.remove(tmpFile)
  await db.collection('thumbnails-cache').replaceOne(cacheFilter, newCacheEntry, { upsert: true })
  return newCacheEntry
}

exports.getThumbnail = async (req, res, url, filePath) => {
  const db = req.app.get('db')

  const sharpOptions = { fit: req.query.fit || 'cover', position: req.query.position || 'center' }
  if (req.query.width) sharpOptions.width = Number(req.query.width)
  if (req.query.height) sharpOptions.height = Number(req.query.height)
  if (!req.query.width && !req.query.height) {
    sharpOptions.width = 300
    sharpOptions.height = 200
  }

  const cacheEntry = await getCacheEntry(db, url, filePath, sharpOptions)

  const ifModifiedSince = req.get('if-modified-since')
  if (ifModifiedSince && cacheEntry.lastModified === ifModifiedSince) {
    debug('if-modified-since matches local date, return 304')
    return res.status(304).send()
  }
  if (cacheEntry.lastModified) res.setHeader('Last-Modified', cacheEntry.lastModified)
  res.setHeader('content-type', 'image/png')
  res.send(cacheEntry.data.buffer)
}
