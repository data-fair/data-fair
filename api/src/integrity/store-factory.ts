// App-only: builds the singleton from config. NEVER imported by tests (it imports #config).
import config from '#config'
import { IntegrityStore, type IntegrityS3Options } from './store.ts'

let _store: IntegrityStore | undefined
export const integrityStore = (): IntegrityStore => {
  if (!config.integrity?.active) throw new Error('integrity capability is not active (config.integrity.active=false)')
  // when active, the config schema guarantees a fully-populated s3 block (endpoint/bucket/credentials)
  if (!_store) {
    // the `.who` attribution sibling must never outlive (or match past) the revision it
    // accompanies — checked once, here, at first activation (fail loud at startup rather than
    // silently writing a longer-lived attribution object later).
    const retentionDays = config.integrity.retention?.days ?? 365
    const attributionRetentionDays = config.integrity.attribution?.retentionDays ?? 180
    if (attributionRetentionDays > retentionDays) {
      throw new Error(`invalid integrity config: attribution.retentionDays (${attributionRetentionDays}) must be <= retention.days (${retentionDays})`)
    }
    _store = new IntegrityStore(config.integrity.s3 as IntegrityS3Options)
  }
  return _store
}
