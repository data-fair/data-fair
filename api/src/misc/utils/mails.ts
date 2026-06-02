import axios from './axios.js'
import config from '#config'
import { internalError } from '@data-fair/lib-node/observer.js'

export type MailRecipient =
  | string
  | { type: 'user' | 'organization', id: string, role?: string, department?: string }

export type Mail = {
  to: MailRecipient[]
  subject: string
  text: string
  html?: string
}

/**
 * Send a mail through simple-directory's internal /api/mails endpoint.
 * Fire-and-forget: failures are reported via internalError, never thrown,
 * so a mail outage cannot break the cron task.
 */
export const sendMail = async (mail: Mail) => {
  const directoryUrl = config.privateDirectoryUrl || config.directoryUrl
  try {
    await axios.post(directoryUrl + '/api/mails', mail, { params: { key: config.secretKeys.sendMails } })
  } catch (err) {
    internalError('send-mail', err)
  }
}
