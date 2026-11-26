import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { text as streamText } from 'node:stream/consumers'
import { createJsonStreamScanner, jsonStreamStringifier } from '../../../api/src/datasets/utils/json-streams.ts'

const scan = (text: Buffer, chunkSize: number, path = ['features']) => {
  const scanner = createJsonStreamScanner({ path })
  const values: unknown[] = []
  for (let i = 0; i < text.length; i += chunkSize) values.push(...scanner.write(text.subarray(i, i + chunkSize)))
  return values
}

// the expected values are those JSONStream.parse(path + '.*') read, the parser the scanner replaced;
// they must not depend on the chunks
const assertScan = (text: string | Buffer, expected: unknown[], path = ['features']) => {
  const bytes = Buffer.from(text)
  for (const chunkSize of [1, 2, 3, 7, 64, bytes.length || 1]) {
    assert.deepEqual(scan(bytes, chunkSize, path), expected, `chunks of ${chunkSize} bytes`)
  }
}

test.describe('json stream scanner', () => {
  test('reads the features of the test resources', () => {
    const dirs = ['tests/resources/geo', 'tests/resources/datasets']
    let files = 0
    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.geojson'))) {
        const text = readFileSync(path.join(dir, file))
        // invalid json (store-file repairs it before parsing)
        if (file === 'geojson-broken-globalid.geojson') {
          assert.throws(() => scan(text, 64))
          continue
        }
        // dataset-siret-extensions.geojson has a trailing comma, JSONStream's parser accepted it
        const strict = text.toString().replace(/,(\s*[}\]])/g, '$1')
        assertScan(text, JSON.parse(strict).features.filter((f: unknown) => f !== null))
        files++
      }
    }
    assert.ok(files > 5)
  })

  test('reads elements of any type and skips null', () => {
    assertScan('{"type":"FeatureCollection","features":[1,null,"a,]}",[1,[2]],{"x":{"y":[]}},true,-1.5e-3 , {} ]}',
      [1, 'a,]}', [1, [2]], { x: { y: [] } }, true, -0.0015, {}])
  })

  test('reads only the features array of the root object', () => {
    assertScan('{"a":{"features":[{"n":1}]},"b":["features",[{"n":2}]],"features":[{"m":1}],"c":[{"n":3}],"bbox":[1,2,3,4]}', [{ m: 1 }])
    assertScan('[{"features":[{"q":1}]}]', [])
    assertScan('{"features":[{"a":1}]} {"features":[{"b":1}]}', [{ a: 1 }, { b: 1 }])
  })

  test('reads strings with escapes and multi-byte characters', () => {
    const feature = {
      type: 'Feature',
      properties: {
        s: 'a "quoted" \\ value } ] {',
        e: 'été 🌍\u2028',
        k: '"features":['
      },
      geometry: null
    }
    assertScan(JSON.stringify({ features: [feature] }), [feature])
  })

  test('keeps long integers as strings and accepts leading zeros, like JSONStream', () => {
    assertScan('{"features":[{"properties":{"id":12345678901234567890,"n":-12345678901234567890,"d":1.12345678901234567890,"z":0012,"f":10000000000000000}},12345678901234567890]}', [
      { properties: { id: '12345678901234567890', n: -12345678901234567000, d: 1.1234567890123457, z: '0012', f: 10000000000000000 } },
      '12345678901234567890'
    ])
  })

  test('ends without an element cut by the end of the text', () => {
    assertScan('{"features":[{"a":1},{"b":', [{ a: 1 }])
  })

  test('fails on an invalid feature', () => {
    assert.throws(() => scan(Buffer.from('{"features":[{"a":1},{"b":oops}]}'), 5))
  })

  test('reads the children of the root value with an empty path', () => {
    assertScan('[{"a":1}, 2 ,"x",null,[3],{"features":[1]}]', [{ a: 1 }, 2, 'x', [3], { features: [1] }], [])
    assertScan('{"a":{"b":1},"c":"d","e":12345678901234567890,"f":null, "g" : [1] }', [{ b: 1 }, 'd', '12345678901234567890', [1]], [])
    assertScan('[1,2] [3]', [1, 2, 3], [])
  })

  test('reads the values of an object at the path', () => {
    assertScan('{"features":{"a":{"x":1},"b":"features","c":[2]}}', [{ x: 1 }, 'features', [2]])
  })

  test('follows a path of several keys', () => {
    const text = '{"marches":{"x":{"marche":[0]},"marche":[{"id":1},{"id":2}],"y":[{"marche":[9]}]},"marche":[3]}'
    assertScan(text, [{ id: 1 }, { id: 2 }], ['marches', 'marche'])
    assertScan('{"marches":[{"marche":[1]}]}', [], ['marches', 'marche'])
  })

  test('keeps the values of root keys', () => {
    const text = Buffer.from('{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:2154"}},"features":[{"crs":1}],"bbox":[1,2,3,4],"name":"n"}')
    for (const chunkSize of [1, 5, text.length]) {
      const scanner = createJsonStreamScanner({ path: ['features'], rootKeys: ['crs', 'name'] })
      const children = []
      for (let i = 0; i < text.length; i += chunkSize) children.push(...scanner.write(text.subarray(i, i + chunkSize)))
      assert.deepEqual(children, [{ crs: 1 }])
      assert.deepEqual(scanner.rootValues, { crs: { type: 'name', properties: { name: 'EPSG:2154' } }, name: 'n' })
    }
  })
})

test.describe('json stream stringifier', () => {
  const stringify = (items: unknown[], ...args: string[]) => streamText(Readable.from(items).pipe(jsonStreamStringifier(...args)))

  // expected texts are those of JSONStream.stringify, that it replaced
  test('writes the default array', async () => {
    assert.equal(await stringify([]), '[\n\n]\n')
    assert.equal(await stringify([{ a: 1 }]), '[\n{"a":1}\n]\n')
    assert.equal(await stringify([{ a: 1 }, 'x', 2]), '[\n{"a":1}\n,\n"x"\n,\n2\n]\n')
  })

  test('writes custom open, separator and close', async () => {
    assert.equal(await stringify([], '[', ',', ']'), '[]')
    assert.equal(await stringify([{ a: 1 }], '[', ',', ']'), '[{"a":1}]')
    assert.equal(await stringify([{ a: 1 }, 'x', 2], '{"features":[', ',', ']}'), '{"features":[{"a":1},"x",2]}')
  })

  test('fails on a value JSON.stringify rejects', async () => {
    await assert.rejects(stringify([{ a: 1n }]))
  })
})
