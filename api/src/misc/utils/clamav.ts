import fs from 'node:fs'
import { Socket } from 'node:net'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { PromiseSocket } from 'promise-socket'
import { Counter } from 'prom-client'
import debugLib from 'debug'
import config from '#config'
import { type Request, type NextFunction } from 'express'
import { reqUserAuthenticated, type User } from '@data-fair/lib-express'
import filesStorage from '#files-storage'
import { Readable } from 'node:stream'
import { isInFilesStorage } from '../../files-storage/utils.ts'
import unzipper from 'unzipper'
import eventsLog from '@data-fair/lib-express/events-log.js'

const debug = debugLib('clamav')

const infectedFilesCounter = new Counter({
  name: 'df_infected_files',
  help: 'A warning about uploaded infected files.',
  labelNames: []
})

// TODO: use a socket pool ? use clamd sessions ?
const runCommand = async (command: string) => {
  debug(`run command "${command}"`)
  const rawSocket = new Socket()
  const socket = new PromiseSocket(rawSocket)
  await socket.connect(config.clamav.port, config.clamav.host)
  await socket.write('n' + command + '\n')
  const result = (await socket.readAll())?.toString().trim()
  await socket.destroy()
  debug(`response -> "${result}"`)
  return result
}

const zTerminator = Buffer.alloc(4, 0)
const formatChunk = (buffer: Buffer) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(buffer.length, 0)
  return Buffer.concat([length, buffer])
}
const scanStream = async (stream: Readable, name: string, user: User) => {
  debug('forward stream ' + name)
  const rawSocket = new Socket()
  const socket = new PromiseSocket(rawSocket)

  await socket.connect(config.clamav.port, config.clamav.host)

  await socket.write('zINSTREAM\0')
  let size = 0
  // default clamav StreamMaxLength is 100Mo
  // but we limit even more at 25Mo
  const maxSize = 25 * 1024 * 1024
  for await (const chunk of stream) {
    try {
      size += (chunk as Buffer).length
      if (size >= maxSize) {
        debug('break on large file ' + name)
        break
      }
      // formatChunk prepends the 4-byte Big Endian length
      await socket.write(formatChunk(chunk as Buffer))
    } catch (err: any) {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
        // ClamAV likely closed the connection because the file was too big
        // Break the loop and try to read the error message from the socket
        break
      }
      throw err
    }
  }
  // Send the 4-byte null terminator to signal end of stream
  try {
    await socket.write(zTerminator)
  } catch (e) {
    // Ignore failure to write terminator if socket already closed
  }
  let result = ''
  try {
    result = (await socket.readAll())!.toString().replace(/\0/g, '').trim()
  } catch (err) {
    console.warn('clamav failure', err)
    throw httpError(400, 'failed to apply antivirus on a file')
  }
  if (result.startsWith('stream: ')) result = result.slice(8)
  await socket.end()
  debug(`ClamAV response -> "${result}"`)

  if (!result) throw new Error('expected clamav result: ' + name)
  if (result.endsWith('OK')) {
    // nothing to do
  } else {
    if (result.endsWith('ERROR')) throw new Error('failure while applying antivirus ' + result.slice(0, -6))
    if (result.endsWith('FOUND')) {
      infectedFilesCounter.inc()
      eventsLog.warn('df.infected-file', `a user attempted to upload an infected file ${name}`, { user })
      throw httpError(400, 'malicious file detected')
    }
    throw new Error('Unexpected result from antivirus: ' + result)
  }
}

export const ping = async () => {
  const result = await runCommand('PING')
  if (result !== 'PONG') throw new Error('expected "PONG" in response')
}

export const middleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.files) {
    next()
    return
  }
  // if (req.files && !Array.isArray(req.files)) throw httpError(400, 'req.files should be an array')
  const files: Express.Multer.File[] = []
  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else {
    for (const f of Object.values(req.files)) files.push(...f)
  }
  await checkFiles(files, reqUserAuthenticated(req))
  next()
}

export const checkFiles = async (files: Express.Multer.File[], user: User) => {
  if (!config.clamav.active) return true
  for (const file of files) {
    const stream = isInFilesStorage(file.path) ? (await filesStorage.readStream(file.path)).body : fs.createReadStream(file.path)
    if (file.path.endsWith('.zip')) {
      const zipDirectory = isInFilesStorage(file.path) ? await filesStorage.zipDirectory(file.path) : await unzipper.Open.file(file.path)
      for (const zipFile of zipDirectory.files) {
        if (zipFile.type === 'Directory') continue
        await scanStream(zipFile.stream(), file.path + '/' + zipFile.path, user)
      }
    } else {
      await scanStream(stream, file.path, user)
    }
  }
  return true
}
