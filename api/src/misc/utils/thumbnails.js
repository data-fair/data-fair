import fs from 'fs-extra'
import sharp from 'sharp'
import pump from '../utils/pipe.ts'
import dayjs from 'dayjs'
import tmp from 'tmp-promise'
import { Binary } from 'mongodb'
import config from '#config'
import mongo from '#mongo'
import axios from './axios.js'
import { setNoCache } from './cache-headers.js'
import { tmpDir } from '../../datasets/utils/files.ts'
import debugLib from 'debug'
import filesStorage from '#files-storage'

const debug = debugLib('thumbnails')

const getCacheEntry = async (db, url, filePath, sharpOptions) => {
  const cacheFilter = { url, ...sharpOptions }
  debug('get thumbnail', cacheFilter, filePath)

  const entry = await db.collection('thumbnails-cache').findOne(cacheFilter)
  const newEntry = { ...cacheFilter, lastUpdated: new Date() }
  const tmpFile = await tmp.tmpName({ prefix: 'cache-entry-', tmpdir: tmpDir })
  if (filePath) {
    newEntry.lastModified = (await filesStorage.fileStats(filePath)).lastModified.toUTCString()
    if (entry && entry.lastModified === newEntry.lastModified) {
      debug('found fresh cache entry for filePath based on lastModified', entry.lastModified)
      return { entry, status: 'HIT' }
    }
    await fs.ensureFile(tmpFile)
    await pump((await filesStorage.readStream(filePath)).body, fs.createWriteStream(tmpFile))
  } else {
    if (entry && dayjs().diff(entry.lastUpdated, 'hour', true) < 1) {
      debug('found fresh cache entry for url based on lastUpdate', entry.lastUpdated)
      return { entry, status: 'HIT' }
    }
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(tmpFile)
    try {
      const headers = {}
      if (entry) {
        if (entry.lastModified) headers['if-modified-since'] = entry.lastModified
        if (entry.etag) headers['if-none-match'] = entry.etag
        debug('attempt to refresh cache content', headers)
      }
      debug('download image into tmp file')
      const response = await axios({ url, responseType: 'stream', headers })
      await pump(response.data, fs.createWriteStream(tmpFile))
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
    const sharpImage = sharp(tmpFile, { animated: true })
    const metadata = await sharpImage.metadata()
    if (metadata.pages) {
      newEntry.data = new Binary(await sharpImage
        .resize(fullSharpOptions)
        .webp()
        .toBuffer())
      newEntry.mimetype = 'image/webp'
    } else {
      newEntry.data = new Binary(await sharpImage
        .resize(fullSharpOptions)
        .png()
        .toBuffer())
      newEntry.mimetype = 'image/png'
    }
    debug('resize ok')
  } catch (/** @type any */ err) {
    console.warn('Sharp error while processing thumbnail for image ' + url, err)
    newEntry.sharpError = err.message
  }
  await fs.remove(tmpFile)
  await db.collection('thumbnails-cache').replaceOne(cacheFilter, newEntry, { upsert: true })
  return { entry: newEntry, status: 'MISS' }
}

export const getThumbnail = async (req, res, url, filePath, thumbnailsOpts = {}) => {
  const db = mongo.db
  const sharpOptions = { fit: req.query.fit || 'cover', position: req.query.position || 'center' }
  // resizeMode was mostly adapted from thumbor and comes from dataset schema
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
    // res.status(400).type('text/plain').send(entry.sharpError)
    res.redirect(url)
  } else {
    res.setHeader('content-type', entry.mimetype || 'image/png')
    res.send(entry.data.buffer)
  }
}

export const prepareThumbnailUrl = (baseUrl, thumbnail = '300x200', draft) => {
  if (thumbnail === 'true' || thumbnail === '1') thumbnail = '300x200'
  const [width, height] = (thumbnail).split('x')
  const thumbnailUrl = new URL(baseUrl)
  if (width) thumbnailUrl.searchParams.set('width', width)
  if (height) thumbnailUrl.searchParams.set('height', height)
  if (draft) thumbnailUrl.searchParams.set('draft', true)
  return thumbnailUrl.href
}
