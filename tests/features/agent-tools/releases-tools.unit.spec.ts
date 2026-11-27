import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  validateGithubPath,
  truncateBody,
  serializeServicesInfo
} from '../../../ui/src/composables/agent/releases-tools-logic.ts'

test.describe('validateGithubPath', () => {
  test('accepts a /repos/ path', () => {
    assert.deepEqual(validateGithubPath('/repos/data-fair/data-fair/releases'), { ok: true })
  })

  test('rejects a non-/repos/ path', () => {
    const r = validateGithubPath('/search/repositories')
    assert.equal(r.ok, false)
    assert.match((r as { message: string }).message, /\/repos\//)
  })

  test('rejects absolute / protocol-relative URLs and traversal', () => {
    assert.equal(validateGithubPath('https://evil.com/repos/x').ok, false)
    assert.equal(validateGithubPath('//evil.com/repos/x').ok, false)
    assert.equal(validateGithubPath('/repos/../../etc').ok, false)
  })

  test('rejects non-string input', () => {
    assert.equal(validateGithubPath(undefined as unknown as string).ok, false)
  })
})

test.describe('truncateBody', () => {
  test('passes short text through untouched', () => {
    assert.deepEqual(truncateBody('hello', 10), { text: 'hello', truncated: false })
  })

  test('truncates text longer than the limit', () => {
    const r = truncateBody('abcdefghij', 4)
    assert.deepEqual(r, { text: 'abcd', truncated: true })
  })
})

test.describe('serializeServicesInfo', () => {
  test('reports installed version, commit and date for loaded services', () => {
    const out = serializeServicesInfo([
      { name: 'data-fair/data-fair', loaded: true, version: '6.6.0', commit: 'abc123', date: '2026-05-01' }
    ])
    assert.match(out, /data-fair\/data-fair/)
    assert.match(out, /6\.6\.0/)
    assert.match(out, /abc123/)
    assert.match(out, /GitHub repo: data-fair\/data-fair/)
  })

  test('reports errors and pending loads', () => {
    const out = serializeServicesInfo([
      { name: 'data-fair/events', error: 'boom' },
      { name: 'data-fair/portals' }
    ])
    assert.match(out, /events.*boom/)
    assert.match(out, /portals.*loading/i)
  })

  test('handles an empty list', () => {
    assert.match(serializeServicesInfo([]), /No services/i)
  })

  test('reports the pull requests of a staging build', () => {
    const out = serializeServicesInfo([
      {
        name: 'data-fair/data-fair',
        loaded: true,
        version: 'staging',
        commit: 'fff000',
        baseCommit: 'abc1234567',
        pullRequests: [
          { number: 12, title: 'New table menus', url: 'https://github.com/data-fair/data-fair/pull/12', sha: '111' },
          { number: 15, title: 'Map legend', url: 'https://github.com/data-fair/data-fair/pull/15', sha: '222' }
        ],
        excludedPullRequests: [
          { number: 14, title: 'Conflicting change', url: 'https://github.com/data-fair/data-fair/pull/14', reason: 'conflict' }
        ]
      },
      { name: 'data-fair/events', loaded: true, version: 'staging', commit: 'eee', baseCommit: 'eee', pullRequests: [], excludedPullRequests: [] },
      { name: 'data-fair/portals', loaded: true, version: '3.1.0', commit: 'ppp' }
    ])
    const [dataFair, events, portals] = out.split('\n').filter(line => line.startsWith('- '))
    assert.match(dataFair, /base commit: abc1234567/)
    assert.match(dataFair, /#12 New table menus/)
    assert.match(dataFair, /#15 Map legend/)
    assert.match(dataFair, /left out.*#14 Conflicting change \(conflict\)/)
    assert.match(events, /default branch only/)
    assert.doesNotMatch(portals, /pull request|default branch/)
  })
})
