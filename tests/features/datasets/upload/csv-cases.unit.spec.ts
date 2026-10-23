// Pure sniffer/escapeKey coverage for the CSV edge cases, without an upload cycle
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import iconv from 'iconv-lite'
import outOfCharacter from 'out-of-character'
import { sniff } from '../../../../api/src/misc/utils/csv-sniffer.ts'
import { detectEncoding } from '../../../../api/src/misc/utils/detect-encoding.ts'
import { escapeKey } from '../../../../api/src/datasets/utils/operations.ts'

// same input as the analyze-csv worker: the 1MB fileSample, decoded with the detected
// encoding and cleaned of invisible chars (BOM, etc.)
const analyzeCsvSample = async (name: string, escapeKeyAlgorithm?: string) => {
  const filePath = `./tests/resources/csv-cases/${name}`
  const size = Math.min(fs.statSync(filePath).size, 1024 * 1024)
  const buffer = Buffer.alloc(size)
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buffer, 0, size, 0)
  fs.closeSync(fd)
  const encoding = detectEncoding(buffer)
  const decodedSample = outOfCharacter.replace(encoding === 'UTF-8' ? buffer.toString() : iconv.decode(buffer, encoding))
  const sniffResult = await sniff(decodedSample)
  const schema = sniffResult.labels
    .map((field: string) => ({
      key: escapeKey(field, escapeKeyAlgorithm),
      'x-originalName': field.replace(/""/g, '"').replace(/^"/, '').replace(/"$/, '')
    }))
    .filter((field: { key: string }) => !!field.key)
  return { props: sniffResult, schema }
}

test.describe('CSV cases (sniffer)', () => {
  test('A CSV with \\r\\n inside quotes, but simply \\n as value separator', async () => {
    const { props, schema } = await analyzeCsvSample('Demarches_PCAET_V1_enr.csv')
    assert.equal(schema[0].key, 'id')
    assert.equal(props.linesDelimiter, '\n')
    assert.equal(props.escapeChar, '"')
    assert.equal(props.quote, '"')
    assert.equal(props.fieldsDelimiter, ';')
  })

  test('A CSV with \\r\\n inside quotes, but simply \\n as value separator (2)', async () => {
    const { props, schema } = await analyzeCsvSample('Demarches_PCAET_V1_entete.csv')
    assert.equal(schema[0].key, 'id')
    assert.equal(props.linesDelimiter, '\n')
    assert.equal(props.escapeChar, '"')
    assert.equal(props.quote, '"')
    assert.equal(props.fieldsDelimiter, ';')
  })

  test('A CSV with commas in quotes', async () => {
    const { props } = await analyzeCsvSample('calendar.csv')
    assert.equal(props.linesDelimiter, '\n')
    assert.equal(props.escapeChar, '"')
    assert.equal(props.quote, '"')
    assert.equal(props.fieldsDelimiter, ',')
  })

  test('Another CSV with single quotes in content', async () => {
    const { props } = await analyzeCsvSample('ouverture.csv')
    assert.equal(props.escapeChar, '"')
    assert.equal(props.quote, '"')
    assert.equal(props.fieldsDelimiter, ';')
  })

  test('A CSV legacy escape key algorithm', async () => {
    const { schema } = await analyzeCsvSample('weird-keys.csv', 'legacy')
    assert.equal(schema[0].key, 'This_key_has_escaped_quotes_in_it')
    assert.equal(schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
  })
})
