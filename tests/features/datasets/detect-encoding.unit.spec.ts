import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { detectEncoding } from '../../../api/src/misc/utils/detect-encoding.ts'
import DecodeStream from '../../../api/src/misc/utils/decode-stream.ts'

test.describe('detectEncoding', () => {
  test('promotes a pure-ASCII buffer to UTF-8 (superset)', () => {
    // genuine ASCII decodes byte-identically as UTF-8, so this never regresses
    assert.equal(detectEncoding(Buffer.from('{"type":"FeatureCollection"}', 'ascii')), 'UTF-8')
  })

  test('promotes a large ASCII-only sample to UTF-8', () => {
    // reproduces the PED_circuit geojson root cause: detection only ever sees a
    // sample from the head of the file (1MB when storing, 32kb when decoding).
    // When that whole sample is 7-bit ASCII — because the first accented byte
    // ("à" = 0xC3 0xA0) only appears deeper in the file — chardet returns
    // "ASCII", and the ASCII codec would later turn "à" into two replacement
    // chars. Promoting to UTF-8 decodes the multi-byte tail correctly.
    const asciiSample = Buffer.from('x'.repeat(1024 * 1024), 'ascii')
    assert.equal(detectEncoding(asciiSample), 'UTF-8')
  })

  test('keeps a genuine non-ASCII detection (UTF-8 with accents up front)', () => {
    const buf = Buffer.from('nom,adresse\nÉglise,Château de Versailles\n'.repeat(50), 'utf8')
    assert.equal(detectEncoding(buf), 'UTF-8')
  })

  test('falls back to UTF-8 on an empty buffer', () => {
    assert.equal(detectEncoding(Buffer.alloc(0)), 'UTF-8')
  })
})

test.describe('DecodeStream', () => {
  const decode = async (inputChunks: Buffer[]): Promise<string> => {
    const ds = new DecodeStream()
    const chunks: Buffer[] = []
    Readable.from(inputChunks).pipe(ds)
    for await (const c of ds) chunks.push(c as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }

  test('decodes accented UTF-8 arriving after an ASCII-detected sample', async () => {
    // exactly the PED_circuit-1.geojson shape: the first chunk exceeds the 32kb
    // sample window and is pure ASCII, so encoding detection fires on it (and,
    // before the fix, latched onto ASCII). The accented "à"/"é" only arrive in
    // a later chunk — where the ASCII codec would have decoded them to
    // replacement chars.
    const head = Buffer.from('x'.repeat(40000), 'ascii') // > sampleSize, triggers detection
    const tail = Buffer.from(" l'Atlantique à la Côte Française", 'utf8')
    const out = await decode([head, tail])
    assert.ok(out.endsWith('à la Côte Française'), `unexpected tail: ${JSON.stringify(out.slice(-40))}`)
    assert.ok(!out.includes('�'), 'output must not contain replacement chars')
  })
})
