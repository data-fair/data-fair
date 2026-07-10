import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseArtefactId, parseAssetsPath } from '../../../api/src/base-applications/operations.ts'

test.describe('base-app artefact id and assets path parsing', () => {
  test('parseArtefactId splits package name and minor ref', () => {
    assert.deepEqual(parseArtefactId('@koumoul/sankey@1.5'), { packageName: '@koumoul/sankey', minor: '1.5' })
    assert.deepEqual(parseArtefactId('@test/monapp1@0.1'), { packageName: '@test/monapp1', minor: '0.1' })
    assert.throws(() => parseArtefactId('@koumoul/sankey'))
    assert.throws(() => parseArtefactId('@koumoul/sankey@1'))
    assert.throws(() => parseArtefactId('@koumoul/sankey@main'))
  })

  test('parseAssetsPath handles versioned and unversioned tiers', () => {
    assert.deepEqual(
      parseAssetsPath(['@koumoul', 'sankey', '1.5', '1.5.3', 'assets', 'index-abc.js']),
      { artefactId: '@koumoul/sankey@1.5', version: '1.5.3', filePath: 'assets/index-abc.js' })
    assert.deepEqual(
      parseAssetsPath(['@koumoul', 'sankey', '1.5', 'thumbnail.png']),
      { artefactId: '@koumoul/sankey@1.5', version: undefined, filePath: 'thumbnail.png' })
    // no minor segment -> not an assets path
    assert.equal(parseAssetsPath(['@koumoul', 'sankey']), null)
    // minor as first segment would leave an empty package name -> reject
    assert.equal(parseAssetsPath(['1.5', 'file.js']), null)
  })
})
