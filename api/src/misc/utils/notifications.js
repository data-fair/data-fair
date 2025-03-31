import config from '#config'
import axios from './axios.js'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'

const debug = debugLib('notifications')

export const send = async (notification, subscribedOnly = false) => {
  if (global.events) global.events.emit('notification', notification)
  debug('send notification', notification)
  const notifyUrl = config.privateNotifyUrl || config.notifyUrl
  if (!notifyUrl) return
  if (process.env.NODE_ENV !== 'test') {
    if (config.privateEventsUrl) {
      if (subscribedOnly) {
        notification.subscribedRecipient = notification.recipient
        delete notification.recipient
      }
      eventsQueue.pushEvent(notification)
    } else if (notifyUrl) {
      await axios.post(`${notifyUrl}/api/v1/notifications`, notification, { params: { key: config.secretKeys.notifications, subscribedOnly } })
        .catch(err => { internalError('notif-push', err) })
    }
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
    .catch(err => { internalError('subscribe-push', err) })
}
