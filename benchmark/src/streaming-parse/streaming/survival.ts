import fs from 'node:fs'
import { benchSchema } from '../../seed.ts'
import { schemaToDescriptor } from '../descriptor.ts'
import { chunked, streaming, bufferedV8, nullSink } from './pipeline.ts'

// argv: [variant, filePath]
// filePath is a pre-generated buffer on disk; fs.readFileSync returns external (non-heap) memory
const [variant, filePath] = process.argv.slice(2)
const buf = fs.readFileSync(filePath)
const descriptor = schemaToDescriptor(benchSchema, true)

if (variant === 'buffered-v8') bufferedV8(buf, descriptor, 'json', nullSink(), () => {})
else streaming(chunked(buf, 65536), descriptor, 'json', variant === 'whole' ? Infinity : Number(variant), nullSink(), () => {})
console.log('OK')
