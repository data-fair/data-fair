import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dependencyStrategy, lockfileHash } from './build.ts'

test('identical lockfiles reuse the current node_modules', () => {
  assert.equal(dependencyStrategy('abc', 'abc'), 'symlink')
})

test('different lockfiles install the ref\'s own dependencies', () => {
  assert.equal(dependencyStrategy('abc', 'def'), 'install')
})

test('lockfile hashes ignore the trailing newline git output loses', () => {
  assert.equal(lockfileHash('{"a":1}\n'), lockfileHash('{"a":1}'))
  assert.notEqual(lockfileHash('{"a":1}'), lockfileHash('{"a":2}'))
})
