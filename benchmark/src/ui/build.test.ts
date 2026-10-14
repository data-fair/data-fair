import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, realpathSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dependencyStrategy, lockfileHash, linkDependencies, withFileRestored } from './build.ts'

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

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'ui-build-test-'))

test('linkDependencies points workspace packages at the worktree, the rest at the shared install', () => {
  const root = tmp()
  const source = path.join(root, 'repo/node_modules')
  mkdirSync(path.join(source, 'vue'), { recursive: true })
  mkdirSync(path.join(source, '@data-fair/lib-vue'), { recursive: true })
  symlinkSync('../../shared', path.join(source, '@data-fair/data-fair-shared'))
  const worktree = path.join(root, 'wt')
  mkdirSync(path.join(worktree, 'shared'), { recursive: true })

  linkDependencies(source, worktree)

  const target = path.join(worktree, 'node_modules')
  assert.equal(realpathSync(path.join(target, 'vue')), realpathSync(path.join(source, 'vue')))
  assert.equal(realpathSync(path.join(target, '@data-fair/lib-vue')), realpathSync(path.join(source, '@data-fair/lib-vue')))
  assert.equal(realpathSync(path.join(target, '@data-fair/data-fair-shared')), realpathSync(path.join(worktree, 'shared')))
})

test('withFileRestored puts back a file the callback overwrote', async () => {
  const file = path.join(tmp(), 'hashes.json')
  writeFileSync(file, 'current')
  await withFileRestored(file, async () => { writeFileSync(file, 'base') })
  assert.equal(readFileSync(file, 'utf8'), 'current')
})

test('withFileRestored removes a file the callback created', async () => {
  const file = path.join(tmp(), 'hashes.json')
  await withFileRestored(file, async () => { writeFileSync(file, 'base') })
  assert.equal(existsSync(file), false)
})
