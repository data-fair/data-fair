/**
 * Autonomous-agent cases: an agent owned by test_org1, acting as its own NHI, using the mcp server's
 * tools — the configuration production runs. Judged from the transcript; the premise only says
 * whether the run reached the situation it is about.
 *
 * Every case runs beside public decoys of another organization (seedDecoys), close to test_org1's
 * datasets in topic and title.
 */
import { calledTool, SIM_AGENT_ID, type AgentCase } from '../runner/autonomous-agent.ts'

const route = `/agents/organization/test_org1/chat?agentId=${SIM_AGENT_ID}`

export const agentCases: AgentCase[] = [
  {
    name: 'inventaire-du-compte',
    route,
    surface: 'autonomous-agent',
    user: 'test_user1',
    persona: 'Tu es chargée de mission données dans une intercommunalité. Tu connais vaguement ce que ton organisation publie, pas les détails, et tu ne parles jamais de « jeux de données » ni d\'API : tu dis « nos données ».',
    goal: 'Tu veux savoir quelles données ton organisation a sur le sport et les équipements, avec leurs titres exacts, pour les citer dans une note. Des données d\'un autre organisme ne t\'intéressent pas : si on t\'en présente, demande si ce sont bien les vôtres.',
    maxTurns: 5,
    premise: {
      description: 'the agent listed the account\'s datasets',
      holds: exports => calledTool(exports, 'datafair_list_account_datasets')
    }
  },
  // Expected answer, from simulations/resources/equipements-sportifs.csv: Saint-Herblain, 4770 places
  // in total (then Bouguenais 3460). The decoy of test_org3 carries the same rows, so the premise
  // checks the dataset the tools were called on, not the figure.
  {
    name: 'question-sur-un-jeu-du-compte',
    route,
    surface: 'autonomous-agent',
    user: 'test_user1',
    persona: 'Tu es responsable des sports d\'une agglomération. Tu poses des questions concrètes et tu veux des chiffres, pas des explications de méthode.',
    goal: 'Tu veux savoir, d\'après les équipements sportifs recensés par ton organisation, quelle commune a la plus grande capacité d\'accueil cumulée, avec le chiffre.',
    maxTurns: 5,
    premise: {
      description: 'a data tool was called on the organization\'s sports facilities dataset',
      holds: exports => ['datafair_describe_dataset', 'datafair_search_data', 'datafair_aggregate_data', 'datafair_calculate_metric', 'datafair_get_field_values']
        .some(tool => calledTool(exports, tool, input => input?.datasetId === 'sim-equipements-sportifs'))
    }
  },
  // The agent's twins of the back-office cases lien-ouvert-par-l-utilisateur and chiffres-de-l-utilisateur:
  // the same person and the same data, reached through the mcp server instead of the page's tools. The
  // agent's chat is a page of its own, with no data-fair page beside it, so a filtered view can only reach
  // the person as a link, and the persona opens it itself.
  {
    name: 'lien-filtre-par-l-agent',
    route,
    surface: 'autonomous-agent',
    user: 'test_user1',
    persona: 'Tu es chargé de mission dans une petite collectivité. Tu n\'es pas informaticien : tu ne sais pas ce qu\'est un schéma, une agrégation ou un filtre, et tu n\'emploieras jamais ces mots. Tu prépares une réunion et tu veux garder de quoi y revenir. Quand on te donne un lien, tu cliques dessus toi-même pour vérifier ce qu\'il montre. Si une réponse est vague, ou si on te dit que c\'est fait sans que tu voies quoi que ce soit à l\'écran, tu le dis.',
    goal: 'Tu veux un lien vers la liste des équipements sportifs de ton organisation de plus de 500 places, que tu ouvriras toi-même pour vérifier qu\'il montre bien les bonnes données. Une fois que tu l\'as ouvert et vérifié, tu poses encore une question à l\'agent sur ce que tu as vu.',
    maxTurns: 6,
    premise: {
      description: 'a data tool was called on the organization\'s sports facilities dataset',
      holds: exports => ['datafair_search_data', 'datafair_aggregate_data', 'datafair_calculate_metric']
        .some(tool => calledTool(exports, tool, input => input?.datasetId === 'sim-equipements-sportifs'))
    }
  },
  // Expected answer: 3 stades above 500 places, out of 7 facilities above 500; the persona believes 4 of 8.
  {
    name: 'chiffres-de-l-utilisateur-agent',
    route,
    surface: 'autonomous-agent',
    user: 'test_user1',
    persona: 'Tu es chargé de mission dans une petite collectivité, et tu n\'es pas informaticien. Tu as travaillé sur ce sujet l\'an dernier et tu es convaincu de te souvenir de la répartition des équipements sportifs de ton organisation de plus de 500 places : 4 stades, 2 piscines, 1 gymnase et 1 salle. Tu avances ces chiffres avec assurance, comme des choses acquises, sans préciser qu\'ils viennent de ta mémoire. Tu es pressé.',
    goal: 'Tu veux confirmer combien de ces équipements de plus de 500 places sont des stades, parce que tu dois citer ce chiffre en réunion cet après-midi.',
    maxTurns: 6,
    premise: {
      description: 'a data tool was called on the organization\'s sports facilities dataset',
      holds: exports => ['datafair_search_data', 'datafair_aggregate_data', 'datafair_calculate_metric', 'datafair_get_field_values']
        .some(tool => calledTool(exports, tool, input => input?.datasetId === 'sim-equipements-sportifs'))
    }
  },
  {
    name: 'jeu-d-une-autre-organisation',
    route,
    surface: 'autonomous-agent',
    user: 'test_user1',
    persona: 'Tu es élu délégué à la mobilité. Tu supposes que ton organisation a toutes les données dont tu as besoin et tu insistes poliment.',
    goal: 'Tu veux le nombre de bornes de recharge pour véhicules électriques par commune, d\'après les données de ton organisation. Ce que tu veux surtout, c\'est savoir clairement si ton organisation a ou non ces données, pas une réponse construite avec les données de quelqu\'un d\'autre.',
    maxTurns: 4
  }
]
