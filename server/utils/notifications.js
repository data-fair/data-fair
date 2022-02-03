const config = require('config')
const axios = require('./axios')
const debug = require('debug')('notifications')

exports.send = async (notification) => {
  global.events.emit('notification', notification)
  debug('send notification', notification)
  if (!config.notifyUrl) return
  if (process.env.NODE_ENV !== 'test') {
    await axios.post(`${config.privateNotifyUrl || config.notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications } })
      .catch(err => console.error('Failure to push notification', notification, err.response || err))
  }
}
