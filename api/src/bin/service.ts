import mongo from '#mongo'
import { rootSettingsFilter, isMainSettings } from '../settings/operations.ts'

export const DEFAULT_RETENTION_DAYS = 30

/** The bin is configured at the organization level only, departments inherit it. */
export const getBinSettings = async (owner: { type: string, id: string }): Promise<{ active: boolean, retentionDays: number }> => {
  const off = { active: false, retentionDays: DEFAULT_RETENTION_DAYS }
  if (owner.type === 'user') return off
  const result = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { _id: 0, type: 1, id: 1, department: 1, bin: 1 } })
  if (!(result && isMainSettings(result) && result.bin)) return off
  return { active: !!result.bin.active, retentionDays: result.bin.retentionDays ?? DEFAULT_RETENTION_DAYS }
}
