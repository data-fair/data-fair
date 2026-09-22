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
  // The hidden-search-terms button: a maintainer who does not know what a synonym list is
  // for, asks for help, and must see the field light up — and nothing saved — before the
  // assistant claims it is done.
  {
    name: 'termes-de-recherche-caches',
    route: '/data-fair/dataset/sim-equipements-sportifs',
    persona: 'Tu es chargé de mission dans une petite collectivité, tu publies des données sans être informaticien. On t\'a dit que les usagers ne trouvent pas ce jeu de données quand ils cherchent "gymnase" ou "piscine". Tu ne sais pas ce qu\'est un index ni un synonyme au sens technique. Si on te dit que c\'est fait sans que tu voies un changement à l\'écran, tu le dis.',
    goal: 'Tu veux que ce jeu de données soit trouvé quand quelqu\'un tape des mots courants comme "gymnase", "piscine" ou "stade" dans la recherche du portail, et tu veux voir ce qui a été ajouté avant que ce soit enregistré.',
    maxTurns: 8
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
  //
  // "Tu ne lis pas l'écran" used to read as blanket permission never to touch
  // the page: a run came back with `observations: []` — no look, no click for
  // the whole case — while the person twice claimed in chat to have pressed
  // Create. The button was never pressed, `dataset-created` could never fire,
  // and the handover under test was unreachable. The one click the case is
  // built on is now stated as something this person does, so the reluctance
  // covers exploring and describing rather than acting.
  //
  // The first wording of that ("quand on te dit sur quel bouton cliquer, tu
  // cliques") overshot: the persona opened with "dites-moi sur quoi cliquer, je
  // le ferai moi-même", the assistant complied, and the person executed five
  // wizard steps by hand across six turns without ever reaching Create — the
  // assistant's own wizard tools sat unused. The goal said "dis-moi sur quoi
  // cliquer" too. Both now say the assistant prepares everything and the person
  // presses one button, which is the shape the case exists to measure.
  {
    name: 'creation-guidee-jeu-de-donnees',
    route: '/data-fair/datasets',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, un jeu de données éditable ou un historique de révisions, et tu n\'emploieras jamais ces mots. Les interfaces te fatiguent : tu n\'explores pas l\'écran de toi-même et tu ne veux pas avoir à le décrire à quelqu\'un. Tu ne veux pas faire les étapes toi-même : tu laisses l\'assistant tout préparer. La seule chose que tu fais à l\'écran, c\'est presser toi-même, avec tes outils, le bouton précis qu\'on te dit prêt à être pressé — et tu ne prétends jamais l\'avoir pressé sans l\'avoir fait. Après ça tu t\'arrêtes : tu n\'explores pas l\'interface tout seul, tu attends qu\'on te dise ce qui se passe. Tu ne demandes pas de détails techniques et tu ne réclames pas de colonnes ou de champs précis.',
    goal: 'Tu dois mettre en place de quoi recueillir les demandes de subvention des associations : tes collègues doivent pouvoir saisir les demandes et corriger leurs erreurs directement dans l\'outil, et tu veux pouvoir retrouver plus tard qui a modifié quoi. Tu veux que l\'assistant prépare tout ça pour toi ; tu presseras toi-même le bouton de création quand il te dira que c\'est prêt. Une fois que tu as cliqué sur le bouton de création, tu poses les mains sur les genoux : tu veux qu\'on te dise ce qui vient d\'être créé et ce qui se passe maintenant, sans que tu aies à redemander, à chercher quoi que ce soit à l\'écran, ni à expliquer où tu es.',
    // 9, not 6: the flow used to end at Create. With add_columns the assistant
    // goes on to the dataset page, proposes the columns and has the person press
    // Enregistrer, which the goal has always needed — colleagues cannot enter a
    // request into a dataset with no columns.
    maxTurns: 9
  },
  // The step after the one above, and the only workflow mechanism nothing has
  // judged: open_add_line_dialog / open_edit_line_dialog hand the form to the
  // editLine_form VJSF subagent. A judged run once died there — the dialog opened
  // on a dataset with no columns, the subagent spent two round trips discovering
  // an empty form, and the person was handed a manual procedure. A precondition
  // now refuses that dialog; this case exercises the path when it should succeed.
  //
  // A different person from the creation case on purpose: the creation goal says
  // the COLLEAGUES enter the requests, and a standalone case cannot lean on a
  // conversation that happened in another run. This one holds the content — the
  // details of a request — which the creation persona never did, so "the
  // assistant prepares, the person presses one button" has to work while the
  // person is also the source of every value.
  {
    name: 'saisie-et-correction-d-une-demande',
    route: '/data-fair/datasets',
    persona: 'Tu travailles au service vie associative d\'une petite collectivité. Tu tiens le registre des demandes de subvention : tu connais les dossiers par cœur, mais pas l\'outil informatique. Tu n\'emploies jamais de vocabulaire technique (ni schéma, ni colonne, ni ligne, ni enregistrement) et tu ne vas pas chercher toi-même où cliquer : tu ne veux pas explorer l\'écran ni le décrire à quelqu\'un. La seule chose que tu fais à l\'écran, c\'est presser toi-même le bouton précis qu\'on te dit prêt à être pressé — et tu ne prétends jamais l\'avoir pressé sans l\'avoir fait. Tu donnes les informations d\'un dossier quand on te les demande, une réponse par question si on te les demande une par une.',
    goal: 'Deux choses à régler dans le registre des demandes de subvention. D\'abord enregistrer une nouvelle demande qui vient d\'arriver : l\'association « Les Amis du Vieux Moulin » demande 4 500 € pour refaire la toiture du moulin, dossier déposé le 3 mars 2026, suivi par le service vie associative. Ensuite corriger une erreur que tu as repérée : la demande du club de judo du centre est inscrite à 12 000 € alors qu\'ils demandaient 1 200 € — il y a un zéro de trop. Tu veux que l\'assistant fasse la saisie et la correction à ta place ; tu presseras toi-même le bouton quand il te dira que c\'est prêt.',
    maxTurns: 9
  }
]
