import config from 'config'
import axios from './axios.js'
import * as metrics from './metrics.js'
import debugLib from 'debug'

const debug = debugLib('notifications')

export const send = async (notification, subscribedOnly = false) => {
  if (global.events) global.events.emit('notification', notification)
  debug('send notification', notification)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  if (process.env.NODE_ENV !== 'test') {
    await axios.post(`${notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications, subscribedOnly } })
      .catch(err => { metrics.internalError('notif-push', err) })
  }
}

export const subscribe = async (req, subscription) => {
  subscription = {
    recipient: { id: req.user.id, name: req.user.name },
    ...subscription
  }
  debug('send subscription', subscription)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  await axios.post(`${notifyUrl}/api/v1/subscriptions`, subscription, { headers: { cookie: req.headers.cookie } })
    .catch(err => { metrics.internalError('subscribe-push', err) })
}
