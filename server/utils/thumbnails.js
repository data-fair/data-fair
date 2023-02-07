const fs = require('fs-extra')
const path = require('path')
const sharp = require('sharp')
const pump = require('util').promisify(require('pump'))
const dayjs = require('dayjs')
const tmp = require('tmp-promise')
const { Binary } = require('mongodb')
const config = require('config')
const axios = require('./axios')
const { setNoCache } = require('./cache-headers')

const debug = require('debug')('thumbnails')
const dataDir = path.resolve(config.dataDir)

const getCacheEntry = async (db, url, filePath, sharpOptions) => {
  const cacheFilter = { url, ...sharpOptions }
  debug('get thumbnail', cacheFilter, filePath)

  const entry = await db.collection('thumbnails-cache').findOne(cacheFilter)
  const newEntry = { ...cacheFilter, lastUpdated: new Date() }
  let tmpFile
  if (filePath) {
    newEntry.lastModified = (await fs.stat(filePath)).mtime.toUTCString()
    if (entry && entry.lastModified === newEntry.lastModified) {
      debug('found fresh cache entry for filePath based on lastModified', entry.lastModified)
      return { entry, status: 'HIT' }
    }
  } else {
    if (entry && dayjs().diff(entry.lastUpdated, 'hour', true) < 1) {
      debug('found fresh cache entry for url based on lastUpdate', entry.lastUpdated)
      return { entry, status: 'HIT' }
    }
    tmpFile = filePath = await tmp.tmpName({ dir: path.join(dataDir, 'tmp') })
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(filePath)
    try {
      const headers = {}
      if (entry) {
        if (entry.lastModified) headers['if-modified-since'] = entry.lastModified
        if (entry.etag) headers['if-none-match'] = entry.etag
        debug('attempt to refresh cache content', headers)
      }
      debug('download image into tmp file')
      const response = await axios({ url, responseType: 'stream', headers })
      await pump(response.data, fs.createWriteStream(filePath))
      debug('fetch of image is ok', response.headers)
      newEntry.lastModified = response.headers['last-modified']
      newEntry.etag = response.headers.etag
    } catch (err) {
      debug('fetch is ko', err)
      // content did not change
      if (err.status === 304) {
        debug(`image was not modified since last fetch ${url}`)
        await db.collection('thumbnails-cache').updateOne(cacheFilter, { $set: { lastUpdated: new Date() } })
        return { entry, status: 'REVALIDATED' }
      } else {
        if (entry) {
          console.warn(`failed to fetch image for thumbnail "${url}", use stale cache entry`, err)
          return { entry, status: 'STALE' }
        } else {
          throw err
        }
      }
    }
  }
  const fullSharpOptions = {
    ...sharpOptions,
    background: { r: 0, g: 0, b: 0, alpha: 1 },
    withoutEnlargement: true
  }
  debug('resize using sharp', fullSharpOptions)
  try {
    newEntry.data = Binary(await sharp(filePath)
      .resize(fullSharpOptions)
      .toBuffer())
    debug('resize ok')
  } catch (err) {
    debug('resize ko', err.message)
    newEntry.sharpError = err.message
  }
  if (tmpFile) await fs.remove(tmpFile)
  await db.collection('thumbnails-cache').replaceOne(cacheFilter, newEntry, { upsert: true })
  return { entry: newEntry, status: 'MISS' }
}

exports.getThumbnail = async (req, res, url, filePath, thumbnailsOpts = {}) => {
  const db = req.app.get('db')
  const sharpOptions = { fit: req.query.fit || 'cover', position: req.query.position || 'center' }
  // resizeMode was mostlye adapted from thumbor and comes from dataset schema
  // but it is fairly easy to match it to sharp options
  if (!req.query.fit && !req.query.position) {
    if (thumbnailsOpts.resizeMode === 'crop') {
      // nothing to do, this is the default
    }
    if (thumbnailsOpts.resizeMode === 'fitIn') {
      sharpOptions.fit = 'inside'
      sharpOptions.position = 'center'
    }
    if (thumbnailsOpts.resizeMode === 'smartCrop') {
      sharpOptions.fit = 'cover'
      sharpOptions.position = 'attention'
    }
  }

  if (req.query.width) sharpOptions.width = Number(req.query.width)
  if (req.query.height) sharpOptions.height = Number(req.query.height)
  if (!req.query.width && !req.query.height) {
    sharpOptions.width = 300
    sharpOptions.height = 200
  }

  const { entry, status } = await getCacheEntry(db, url, filePath, sharpOptions)

  const ifModifiedSince = req.get('if-modified-since')
  if (ifModifiedSince && entry.lastModified === ifModifiedSince) {
    debug('if-modified-since matches local date, return 304')
    return res.status(304).send()
  }
  if (entry.lastModified) res.setHeader('Last-Modified', entry.lastModified)
  res.setHeader('X-Thumbnails-Cache-Status', status)
  if (req.publicOperation) {
    // force buffering (necessary for caching) of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'yes')
    res.setHeader('Cache-Control', `must-revalidate, public, max-age=${config.cache.publicMaxAge}`)
  } else {
    setNoCache(req, res)
  }
  if (entry.sharpError) {
    res.status(400).send(entry.sharpError)
  } else {
    res.setHeader('content-type', 'image/png')
    res.send(entry.data.buffer)
  }
}

exports.prepareThumbnailUrl = (baseUrl, thumbnail = '300x200', draft) => {
  if (thumbnail === 'true' || thumbnail === '1') thumbnail = '300x200'
  const [width, height] = (thumbnail).split('x')
  const thumbnailUrl = new URL(baseUrl)
  if (width) thumbnailUrl.searchParams.set('width', width)
  if (height) thumbnailUrl.searchParams.set('height', height)
  if (draft) thumbnailUrl.searchParams.set('draft', true)
  return thumbnailUrl.href
}
