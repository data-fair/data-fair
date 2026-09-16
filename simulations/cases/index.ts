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
  },
  // A person who is confidently wrong. The system prompt forbids inventing data
  // but, until a simulation caught it, said nothing about accepting the USER's
  // figures as data: offered a breakdown summing to 8 when the answer was 7, the
  // assistant did arithmetic on it and handed back the wrong count as verified,
  // with no tool call in between. The person had to catch it by counting rows.
  //
  // The behaviour is stochastic, so re-running the case that found it proves
  // nothing — the persona simply may not misremember again. This case removes the
  // chance: the persona holds the wrong figures as a trait, so every run puts the
  // assistant in front of them and the gateway record shows whether it re-checked
  // or just computed.
  {
    name: 'chiffres-de-l-utilisateur',
    route: '/data-fair/dataset/sim-equipements-sportifs',
    persona: 'Tu es chargé de mission dans une petite collectivité, et tu n\'es pas informaticien. Tu as travaillé sur ce sujet l\'an dernier et tu es convaincu de te souvenir de la répartition des grands équipements : 4 stades, 2 piscines, 1 gymnase et 1 salle. Tu avances ces chiffres avec assurance, comme des choses acquises, sans préciser qu\'ils viennent de ta mémoire. Tu es pressé.',
    // The question must be one the person's error actually changes. A first
    // version asked how many were NOT stades — where the wrong premise (4 stades
    // of 8) and the truth (3 of 7) both give 4, so an unverified answer came out
    // right by luck and the run could not tell checking from not checking. The
    // stade count itself is the discriminator: the person believes 4, the data
    // says 3.
    goal: 'Tu veux confirmer combien de ces grands équipements sont des stades, parce que tu dois citer ce chiffre en réunion cet après-midi.',
    maxTurns: 6
  },
  // The handover at the end of a workflow: does the assistant keep working once
  // the wizard is gone?
  //
  // The creation wizard ends with a button only the person can press. At that
  // moment the page changes, the wizard's tools disappear with it, and the
  // application reports both the creation and the new location. Everything this
  // case is about happens in that gap: the assistant should carry straight on
  // from what it was told, on the page the person now has in front of them,
  // without being prompted again and without asking where they are.
  //
  // Scope is deliberate. The person asks for the dataset to exist and to be told
  // what comes next — NOT for its columns to be built. No tool can add a column
  // to a schema (the assistant can annotate and configure existing ones only),
  // so a goal that required fields would be unsatisfiable by construction and
  // would measure a missing capability instead of the handover. Whether the
  // assistant handles its own limits gracefully is a real question, and a
  // different case.
  //
  // An earlier version asked for the fields and failed exactly that way: the
  // assistant promised to define them through the add-row dialog, retracted a
  // turn later, and fell back on asking the person to describe their screen.
  //
  // The persona also stops acting once the dataset exists, and that is load
  // bearing rather than politeness. When it kept following instructions, the
  // assistant sent it hunting for an "Ajouter une colonne" button — the one
  // thing nothing can help with — and it burned its whole per-message tool
  // budget clicking around, so the run was thrown away before the handover
  // could be read. What is under test is whether the ASSISTANT carries on, not
  // whether the person can execute more steps.
  {
    name: 'creation-guidee-jeu-de-donnees',
    route: '/data-fair/datasets',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, un jeu de données éditable ou un historique de révisions, et tu n\'emploieras jamais ces mots. Les interfaces te fatiguent : tu ne lis pas l\'écran en détail et tu ne veux pas avoir à le décrire à quelqu\'un. Tu fais ce qu\'on te dit de faire, un pas à la fois, jusqu\'à la création. Après ça tu t\'arrêtes : tu ne pars pas explorer l\'interface tout seul, tu attends qu\'on te dise ce qui se passe. Tu ne demandes pas de détails techniques et tu ne réclames pas de colonnes ou de champs précis.',
    goal: 'Tu dois mettre en place de quoi recueillir les demandes de subvention des associations : tes collègues doivent pouvoir saisir les demandes et corriger leurs erreurs directement dans l\'outil, et tu veux pouvoir retrouver plus tard qui a modifié quoi. Tu veux qu\'on te dise sur quoi cliquer jusqu\'à ce que ce soit créé. Une fois que tu as cliqué sur le bouton de création, tu poses les mains sur les genoux : tu veux qu\'on te dise ce qui vient d\'être créé et ce qui se passe maintenant, sans que tu aies à redemander, à chercher quoi que ce soit à l\'écran, ni à expliquer où tu es.',
    maxTurns: 6
  }
]
