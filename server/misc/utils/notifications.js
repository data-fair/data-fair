const config = require('config')
const axios = require('./axios')
const observe = require('./observe')
const debug = require('debug')('notifications')

exports.send = async (notification, subscribedOnly = false) => {
  if (global.events) global.events.emit('notification', notification)
  debug('send notification', notification)
  if (!config.notifyUrl) return
  if (process.env.NODE_ENV !== 'test') {
    await axios.post(`${config.privateNotifyUrl || config.notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications, subscribedOnly } })
      .catch(err => {
        observe.internalError.inc({ errorCode: 'notif-push' })
        console.error('(notif-push) Failure to push notification', notification, err.response || err)
      })
  }
}

exports.subscribe = async (req, subscription) => {
  subscription = {
    recipient: { id: req.user.id, name: req.user.name },
    ...subscription
  }
  debug('send subscription', subscription)
  if (!config.notifyUrl) return
  await axios.post(`${config.privateNotifyUrl || config.notifyUrl}/api/v1/subscriptions`, subscription, { headers: { cookie: req.headers.cookie } })
    .catch(err => {
      observe.internalError.inc({ errorCode: 'notif-push' })
      console.error('(notif-push) Failure to push subscription', subscription, err.response || err)
    })
}
