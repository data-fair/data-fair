const config = require('config')
const axios = require('./axios')
const metrics = require('./metrics')
const debug = require('debug')('notifications')

exports.send = async (notification, subscribedOnly = false) => {
  if (global.events) global.events.emit('notification', notification)
  debug('send notification', notification)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  if (process.env.NODE_ENV !== 'test') {
    await axios.post(`${notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications, subscribedOnly } })
      .catch(err => {
        metrics.internalError('notif-push', err)
      })
  }
}

exports.subscribe = async (req, subscription) => {
  subscription = {
    recipient: { id: req.user.id, name: req.user.name },
    ...subscription
  }
  debug('send subscription', subscription)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  await axios.post(`${notifyUrl}/api/v1/subscriptions`, subscription, { headers: { cookie: req.headers.cookie } })
    .catch(err => {
      metrics.internalError('notif-push', err)
    })
}
