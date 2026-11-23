import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import JSONStream from 'JSONStream'
import { createGeojsonFeaturesScanner } from '../../../api/src/datasets/utils/geojson-features-stream.ts'

const scan = (text: Buffer, chunkSize: number) => {
  const scanner = createGeojsonFeaturesScanner()
  const values: unknown[] = []
  for (let i = 0; i < text.length; i += chunkSize) values.push(...scanner.write(text.subarray(i, i + chunkSize)))
  return values
}

const jsonStream = (text: Buffer) => new Promise<unknown[]>((resolve, reject) => {
  const values: unknown[] = []
  const parser = JSONStream.parse('features.*')
  parser.on('data', (v: unknown) => values.push(v))
  parser.on('error', reject)
  parser.on('end', () => resolve(values))
  parser.end(text)
})

// the scanner must read the same values as JSONStream, whatever the chunks
const assertSameAsJSONStream = async (text: string | Buffer) => {
  const bytes = Buffer.from(text)
  const expected = await jsonStream(bytes)
  for (const chunkSize of [1, 2, 3, 7, 64, bytes.length || 1]) {
    assert.deepEqual(scan(bytes, chunkSize), expected, `chunks of ${chunkSize} bytes`)
  }
  return expected
}

test.describe('geojson features stream', () => {
  test('reads the test resources like JSONStream', async () => {
    const dirs = ['tests/resources/geo', 'tests/resources/datasets']
    let files = 0
    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.geojson'))) {
        const text = readFileSync(path.join(dir, file))
        // invalid json (store-file repairs it before parsing): both fail
        if (file === 'geojson-broken-globalid.geojson') {
          await assert.rejects(jsonStream(text))
          assert.throws(() => scan(text, 64))
          continue
        }
        await assertSameAsJSONStream(text)
        files++
      }
    }
    assert.ok(files > 5)
  })

  test('reads elements of any type and skips null, like JSONStream', async () => {
    const values = await assertSameAsJSONStream('{"type":"FeatureCollection","features":[1,null,"a,]}",[1,[2]],{"x":{"y":[]}},true,-1.5e-3 , {} ]}')
    assert.equal(values.length, 7)
  })

  test('reads only the features array of the root object', async () => {
    const values = await assertSameAsJSONStream('{"a":{"features":[{"n":1}]},"b":["features",[{"n":2}]],"features":[{"m":1}],"c":[{"n":3}],"bbox":[1,2,3,4]}')
    assert.deepEqual(values, [{ m: 1 }])
    assert.deepEqual(await assertSameAsJSONStream('[{"features":[{"q":1}]}]'), [])
    assert.deepEqual(await assertSameAsJSONStream('{"features":[{"a":1}]} {"features":[{"b":1}]}'), [{ a: 1 }, { b: 1 }])
  })

  test('reads strings with escapes and multi-byte characters', async () => {
    await assertSameAsJSONStream(JSON.stringify({
      features: [{ type: 'Feature', properties: { s: 'a "quoted" \\ value } ] {', e: 'été 🌍 \u2028', k: '"features":[' }, geometry: null }]
    }))
  })

  test('keeps long integers as strings and accepts leading zeros, like JSONStream', async () => {
    const values = await assertSameAsJSONStream('{"features":[{"properties":{"id":12345678901234567890,"n":-12345678901234567890,"d":1.12345678901234567890,"z":0012,"f":10000000000000000}},12345678901234567890]}')
    assert.deepEqual(values[0], { properties: { id: '12345678901234567890', n: -12345678901234567000, d: 1.1234567890123457, z: '0012', f: 10000000000000000 } })
    assert.equal(values[1], '12345678901234567890')
  })

  test('ends without an element cut by the end of the text, like JSONStream', async () => {
    assert.deepEqual(await assertSameAsJSONStream('{"features":[{"a":1},{"b":'), [{ a: 1 }])
  })

  test('fails on an invalid feature', async () => {
    assert.throws(() => scan(Buffer.from('{"features":[{"a":1},{"b":oops}]}'), 5))
  })
})
