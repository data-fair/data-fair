import fs from 'fs-extra'
import path from 'node:path'
import filesStorage from '#files-storage'
import mongo from '#mongo'
import { tmpDir, validationDiagnosticFilePath } from './files.ts'
import type { Dataset } from '#types'

export type DiagnosticErrorType = 'validation' | 'extension'

export type DiagnosticErrorEntry = {
  line: number
  type: DiagnosticErrorType
  field: string
  message: string
  rawValue?: string
}

export const DIAGNOSTIC_FILE_CAP = 10000

const RAW_VALUE_TRUNCATE = 200

const csvEscape = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null) return ''
  const s = String(v).replace(/"/g, '""')
  if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s}"`
  return s
}

/**
 * Owns the lifecycle of one validation-diagnostic CSV per dataset.
 *
 * Lazy: no file is created until the first error is added.
 * - finalize() persists the file (overwriting any prior diagnostic) when at least
 *   one error was added; otherwise it behaves like discard().
 * - discard() always removes any pre-existing file at the target path so a
 *   successful re-run clears stale diagnostics from a prior failed attempt.
 */
export class DiagnosticWriter {
  private dataset: Dataset
  private targetPath: string
  private tmpPath: string
  private writeStream: fs.WriteStream | null = null
  private count = 0
  private capped = false

  constructor (dataset: Dataset) {
    this.dataset = dataset
    this.targetPath = validationDiagnosticFilePath(dataset)
    this.tmpPath = path.join(tmpDir, `validation-diagnostic-${dataset.id}-${Date.now()}-${process.pid}.csv`)
  }

  // The hasDiagnosticFile flag on a journal event reflects the live filesystem
  // state, which has just changed. Clear it from any prior events in the same
  // draft bucket so the UI can trust event.hasDiagnosticFile directly.
  private async clearStaleJournalFlags (): Promise<void> {
    const isDraft = !!this.dataset.draftReason
    await mongo.db.collection('journals').updateOne(
      {
        type: 'dataset',
        id: this.dataset.id,
        'owner.type': this.dataset.owner.type,
        'owner.id': this.dataset.owner.id
      },
      { $unset: { 'events.$[stale].hasDiagnosticFile': '' } },
      {
        arrayFilters: [{
          'stale.hasDiagnosticFile': true,
          ...(isDraft ? { 'stale.draft': true } : { 'stale.draft': { $ne: true } })
        }]
      }
    )
  }

  private ensureStream () {
    if (this.writeStream) return
    fs.ensureDirSync(path.dirname(this.tmpPath))
    this.writeStream = fs.createWriteStream(this.tmpPath, { encoding: 'utf8' })
    // BOM for Excel
    this.writeStream.write('﻿')
    this.writeStream.write('line,error_type,field,message,raw_value\n')
  }

  async addError (entry: DiagnosticErrorEntry): Promise<void> {
    if (this.count >= DIAGNOSTIC_FILE_CAP) {
      this.capped = true
      return
    }
    this.ensureStream()
    const truncated = entry.rawValue && entry.rawValue.length > RAW_VALUE_TRUNCATE
      ? entry.rawValue.slice(0, RAW_VALUE_TRUNCATE) + '…'
      : entry.rawValue
    const row = [
      entry.line,
      entry.type,
      csvEscape(entry.field),
      csvEscape(entry.message),
      csvEscape(truncated)
    ].join(',') + '\n'
    this.writeStream!.write(row)
    this.count += 1
  }

  async finalize (): Promise<{ count: number, capped: boolean }> {
    if (!this.writeStream || this.count === 0) {
      await this.discard()
      return { count: 0, capped: false }
    }
    await new Promise<void>((resolve, reject) => {
      this.writeStream!.end((err: any) => err ? reject(err) : resolve())
    })
    this.writeStream = null
    await filesStorage.moveFromFs(this.tmpPath, this.targetPath)
    await this.clearStaleJournalFlags()
    return { count: this.count, capped: this.capped }
  }

  async discard (): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>(resolve => this.writeStream!.end(() => resolve()))
      this.writeStream = null
    }
    await fs.remove(this.tmpPath).catch(() => {})
    if (await filesStorage.pathExists(this.targetPath)) {
      await filesStorage.removeFile(this.targetPath)
    }
    await this.clearStaleJournalFlags()
  }
}
