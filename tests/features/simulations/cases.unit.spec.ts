/**
 * Deterministic checks on the case registry. No model involved, so these run in
 * the normal unit suite; they prove each case is the case it claims to be
 * before anyone spends quota finding out otherwise.
 */

import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cases } from '../../../simulations/cases/index.ts'

test.describe('case registry', () => {
  test('names are unique and filesystem-safe', () => {
    // Evidence files are named `sim-<name>.json`, so a duplicate silently
    // overwrites another case's transcript and a slash writes outside the
    // evidence directory.
    assert.ok(cases.length > 0, 'the registry is empty — every simulation would report "not run"')
    // Every designed case is registered. A case silently dropped during a
    // refactor would otherwise just report "not run" and be scrolled past.
    // The first two are a matched pair over the ways the page can navigate —
    // the person clicking a link the assistant produced, and the assistant
    // navigating itself. The third holds a persona to figures that are wrong,
    // so the grounding rule is exercised on purpose rather than by luck.
    for (const name of ['lien-ouvert-par-l-utilisateur', 'question-sur-les-donnees', 'chiffres-de-l-utilisateur']) {
      assert.ok(cases.some(c => c.name === name), `case ${name} is missing from the registry`)
    }
    assert.equal(new Set(cases.map(c => c.name)).size, cases.length, 'duplicate case name')
    for (const c of cases) {
      assert.match(c.name, /^[a-z0-9-]+$/, `${c.name}: evidence files are named after this`)
    }
  })

  test('every case has a goal, a persona and a data-fair route', () => {
    for (const c of cases) {
      assert.ok(c.goal.length > 20, `${c.name}: goal should describe an outcome`)
      assert.ok(c.persona.length > 20, `${c.name}: persona should describe a person`)
      // goToWithAuth is called with the full app path, as every e2e test does.
      assert.ok(c.route.startsWith('/data-fair/'), `${c.name}: route ${c.route}`)
      assert.ok(c.maxTurns >= 2 && c.maxTurns <= 12, `${c.name}: maxTurns ${c.maxTurns}`)
    }
  })

  test('no case states an expected result — runs are judged, not diffed', () => {
    // A runtime `c.expected === undefined` check could not fail: SimulationCase
    // has no such property, so excess-property checking rejects it at the
    // literal. The registry SOURCE is where a regression would appear.
    const source = readFileSync('simulations/cases/index.ts', 'utf8')
    assert.equal(
      /^\s*expected\w*\s*:/m.test(source),
      false,
      'a case declares an expected result; runs are judged from their transcript, not diffed against a blob'
    )
  })
})

test.describe('case selection across the two simulation specs', () => {
  test('a spec gets only the requested cases it owns', async () => {
    const { selectOwnCases } = await import('../../../simulations/cases/select.ts')
    const { agentCases } = await import('../../../simulations/cases/autonomous-agents.ts')
    assert.deepEqual(selectOwnCases(cases, ['inventaire-du-compte']), [])
    assert.deepEqual(selectOwnCases(agentCases, ['inventaire-du-compte']).map(c => c.name), ['inventaire-du-compte'])
  })

  test('no request selects all of a spec\'s cases', async () => {
    const { selectOwnCases } = await import('../../../simulations/cases/select.ts')
    assert.equal(selectOwnCases(cases, []).length, cases.length)
  })

  test('an unknown name still fails loudly', async () => {
    const { selectOwnCases } = await import('../../../simulations/cases/select.ts')
    assert.throws(() => selectOwnCases(cases, ['no-such-case']), /unknown simulation case/)
  })

  test('names are unique across both specs, since evidence files are named after them', async () => {
    const { agentCases } = await import('../../../simulations/cases/autonomous-agents.ts')
    const names = [...cases, ...agentCases].map(c => c.name)
    assert.equal(new Set(names).size, names.length)
    for (const name of agentCases.map(c => c.name)) assert.match(name, /^[a-z0-9-]+$/)
  })

  test('the line edition runs are known to the report, with names of their own', async () => {
    const { allCases } = await import('../../../simulations/cases/select.ts')
    assert.ok(allCases.some(c => c.name === 'saisie-courriel--editor--r2'))
    assert.equal(new Set(allCases.map(c => c.name)).size, allCases.length)
  })
})
