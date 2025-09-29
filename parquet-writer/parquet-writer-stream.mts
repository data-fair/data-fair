import { Transform, type TransformCallback } from 'stream'
import { type BasicSchemaProperty, ParquetWriter } from './index.js'

const millisPerDay = 86400000

export class ParquetWriterStream extends Transform {
  private schema: BasicSchemaProperty[]
  private parquetWriter: ParquetWriter
  private rows: any[] = []

  constructor (schema: BasicSchemaProperty[]) {
    super({objectMode: true})
    this.schema = schema
    this.parquetWriter = new ParquetWriter(schema)
  }

  _transform (row: any, _: BufferEncoding, callback: TransformCallback): void {
    // convert to timestamps
    for (const prop of this.schema) {
      if (prop.type === 'string' && prop.format === 'date-time' && row[prop.key]) {
        row[prop.key] = new Date(row[prop.key]).getTime()
      }
      if (prop.type === 'string' && prop.format === 'date' && row[prop.key]) {
        row[prop.key] = Math.floor(new Date(row[prop.key]).getTime() / millisPerDay)
      }
    }
    this.rows.push(row)
    if (this.rows.length >= 20000) {
      const buffer = this.parquetWriter.addRows(this.rows)
      this.rows = []
      callback(null, buffer)
    } else {
      callback()
    }
  }

  _flush (callback: TransformCallback): void {
    let buffer = this.parquetWriter.addRows(this.rows)
    buffer = Buffer.concat([buffer, this.parquetWriter.finish()])
    callback(null, buffer)
  }
}
