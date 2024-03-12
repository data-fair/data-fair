const path = require('path')
const config = /** @type {any} */(require('config'))
const { Socket } = require('node:net')
const createError = require('http-errors')
const { PromiseSocket } = require('promise-socket')
const { Counter } = require('prom-client')
const asyncWrap = require('./async-handler')
const debug = require('debug')('clamav')

const infectedFilesCounter = new Counter({
  name: 'df_infected_files',
  help: 'A warning about uploaded infected files.',
  labelNames: []
})

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
  await exports.checkFiles(req.files, req.user)
  next()
})

exports.checkFiles = async (files, user) => {
  if (!config.clamav.active) return true
  for (const file of files || []) {
    const remotePath = path.join(config.clamav.dataDir, path.relative(config.dataDir, file.path))
    const result = await runCommand(`SCAN ${remotePath}`)
    console.log(result)
    if (result.endsWith('OK')) continue
    if (result.endsWith('ERROR')) throw createError('failure while applying antivirus ' + result.slice(0, -6))
    if (result.endsWith('FOUND')) {
      infectedFilesCounter.inc()
      console.warn('[infected-file] a user attempted to upload an infected file', result, user, file)
      throw createError(400, 'malicious file detected')
    }
    throw createError('Unexpected result from antivirus ' + result)
  }
  return true
}
