/**
 * What a case is: a page, a person, and something they want. There is
 * deliberately NO expected result — a run is judged by reading its transcript,
 * not by diffing its output against a blob written by whoever wrote the case.
 */

import type { SimulationCase } from '@data-fair/lib-agents-sim'

export const cases: SimulationCase[] = [
  // Covers the navigation the PERSON performs, by clicking a link the assistant
  // produced. Its companion below covers the navigation the ASSISTANT performs.
  // The two are different code paths — decideAgentNavigation resolving an
  // in-chat link against the host router, versus the navigate tool — and both
  // have to leave the chat usable afterwards, which is what the goal's last
  // clause puts under test.
  //
  // The goal deliberately needs something the UI does not hand over. An earlier
  // version of this case asked only to find and open a dataset, and a persona
  // with look/click simply did it itself: zero gateway exchanges, the assistant
  // never addressed. A filtered view is not reachable by pointing at things, so
  // asking is the only way through.
  {
    name: 'lien-ouvert-par-l-utilisateur',
    route: '/data-fair/datasets',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, une agrégation ou un filtre, et tu n\'emploieras jamais ces mots. Tu prépares une réunion et tu veux garder de quoi y revenir. Si une réponse est vague, ou si on te dit que c\'est fait sans que tu voies quoi que ce soit à l\'écran, tu le dis.',
    goal: 'Tu veux un lien vers la liste des équipements sportifs de plus de 500 places, que tu ouvriras toi-même pour vérifier qu\'il montre bien les bonnes données. Une fois que tu l\'as ouvert et vérifié, tu veux encore pouvoir poser une question à l\'assistant sur ce que tu as sous les yeux.',
    maxTurns: 6
  },
  {
    name: 'question-sur-les-donnees',
    route: '/data-fair/dataset/sim-equipements-sportifs',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, une agrégation ou un filtre, et tu n\'emploieras jamais ces mots. Tu prépares une réunion pour cet après-midi et tu es pressé. Si une réponse est vague, ou si on te dit que c\'est fait sans que tu voies quoi que ce soit à l\'écran, tu le dis.',
    goal: 'Tu veux savoir quels équipements peuvent accueillir plus de 500 personnes, et pouvoir les montrer à l\'écran pendant ta réunion — pas seulement une liste recopiée dans la discussion.',
    maxTurns: 8
  }
]
