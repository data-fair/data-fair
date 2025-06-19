import path from 'path'
import { Socket } from 'node:net'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { PromiseSocket } from 'promise-socket'
import { Counter } from 'prom-client'
import debugLib from 'debug'
import config from '#config'
import { Request } from 'express'
import { NextFunction } from 'http-proxy-middleware/dist/types.js'
import { reqUserAuthenticated, type User } from '@data-fair/lib-express'

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
    const remotePath = path.join(config.clamav.dataDir, path.relative(config.dataDir, file.path))
    const result = await runCommand(`SCAN ${remotePath}`)
    if (!result) throw new Error('expected clamav result: ' + remotePath)
    if (result.endsWith('OK')) continue
    if (result.endsWith('ERROR')) throw new Error('failure while applying antivirus ' + result.slice(0, -6))
    if (result.endsWith('FOUND')) {
      infectedFilesCounter.inc()
      console.warn('[infected-file] a user attempted to upload an infected file', result, user, file)
      throw httpError(400, 'malicious file detected')
    }
    throw new Error('Unexpected result from antivirus ' + result)
  }
  return true
}
