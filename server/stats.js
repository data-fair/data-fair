const express = require('express')
const auth = require('./auth')
const datasetUtils = require('./utils/dataset')

const router = module.exports = express.Router()

router.get('', auth.jwtMiddleware, async (req, res, next) => {
  try {
    const stats = {
      storage: {}
    }
    const owners = [{id: req.user.id, type: 'user'}]
    req.user.organizations.forEach(orga => {
      owners.push({id: orga.id, type: 'organization'})
    })
    for (let owner of owners) {
      stats.storage[owner.id] = await datasetUtils.storageSize(req.app.get('db'), owner)
    }
    res.send(stats)
  } catch (err) {
    next(err)
  }
})
