import axios from './axios.ts'
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
 * Failures are reported via internalError and never thrown, so a mail outage
 * cannot break the cron task. Returns true only when the mail actually went
 * out, so callers can avoid recording a notification that was never sent.
 */
export const sendMail = async (mail: Mail): Promise<boolean> => {
  const directoryUrl = config.privateDirectoryUrl || config.directoryUrl
  try {
    await axios.post(directoryUrl + '/api/mails', mail, { params: { key: config.secretKeys.sendMails } })
    return true
  } catch (err) {
    internalError('send-mail', err)
    return false
  }
}
