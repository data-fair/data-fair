// for live performance inspection

const express = require('express')
const asyncWrap = require('./async-wrap')

exports.getCPUProfile = async (duration = 2000) => {
  const { Session } = require('node:inspector/promises')
  const session = new Session()
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.start')

  await new Promise(resolve => setTimeout(resolve, duration))
  const { profile } = await session.post('Profiler.stop')

  session.disconnect()

  return profile
}

const router = exports.router = express.Router()

router.get('/cpu-profile', asyncWrap(async (req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()

  const duration = req.query.duration ? parseInt(req.query.duration) : 2000
  const profile = await exports.getCPUProfile(duration)
  res.set('Content-Disposition', `attachment; filename="data-fair-${new Date().toISOString()}.cpuprofile"`)
  res.send(profile)
}))
