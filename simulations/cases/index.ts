/**
 * What a case is: a page, a person, and something they want. There is
 * deliberately NO expected result — a run is judged by reading its transcript,
 * not by diffing its output against a blob written by whoever wrote the case.
 */

import type { SimulationCase } from '@data-fair/lib-agents-sim'

export const cases: SimulationCase[] = [
  {
    name: 'trouver-un-jeu-de-donnees',
    route: '/data-fair/datasets',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu es à l\'aise avec des tableaux mais tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, une agrégation ou un filtre, et tu n\'emploieras jamais ces mots. Tu demandes ce que tu veux en langage courant et tu es pressé.',
    goal: 'Tu veux retrouver le jeu de données qui recense les équipements sportifs de la commune, et l\'ouvrir pour le voir à l\'écran.',
    maxTurns: 4
  }
]
