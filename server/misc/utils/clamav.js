const path = require('path')
const config = require('config')
const { Socket } = require('node:net')
const createError = require('http-errors')
const { PromiseSocket } = require('promise-socket')
const asyncWrap = require('./async-handler')
const observe = require('./observe')
const debug = require('debug')('clamav')

// TODO: use a socket pool ? use clamd sessions ?
const runCommand = async (command) => {
  debug(`run command "${command}"`)
  const rawSocket = new Socket()
  const socket = new PromiseSocket(rawSocket)
  await socket.connect(config.clamav.port, config.clamav.host)
  await socket.write('n' + command + '\n')
  const result = (await socket.readAll()).toString().trim()
  await socket.destroy()
  debug(`response -> "${result}"`)
  return result
}

exports.ping = async () => {
  const result = await runCommand('PING')
  if (result !== 'PONG') throw new Error('expected "PONG" in response')
}

exports.middleware = asyncWrap(async (req, res, next) => {
  if (!config.clamav.active) return next()
  for (const file of req.files || []) {
    const remotePath = path.join(config.clamav.dataDir, path.relative(config.dataDir, file.path))
    const result = await runCommand(`SCAN ${remotePath}`)
    if (result.endsWith('OK')) continue
    if (result.endsWith('ERROR')) throw createError('failure while applying antivirus ' + result.slice(0, -6))
    if (result.endsWith('FOUND')) {
      observe.infectedFiles.inc()
      console.warn('[infected-file] a user attempted to upload an infected file', result, req.user, file)
      throw createError(400, 'malicious file detected')
    }
    throw createError('Unexpected result from antivirus ' + result)
  }
  next()
})
