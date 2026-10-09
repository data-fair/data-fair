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
