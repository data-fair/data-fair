const EventEmitter = require('events')
const config = require('config')
const axios = require('axios').create()

const events = exports.events = new EventEmitter()

exports.send = async (notification) => {
  if (!config.notifyUrl) return
  events.emit(`notification-${notification.topic}`, notification)
  if (process.env.NODE_ENV !== 'test') {
    await axios.post(`${config.privateNotifyUrl || config.notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications } })
      .catch(err => console.error('Failure to push notification', notification, err.response || err))
  }
}
