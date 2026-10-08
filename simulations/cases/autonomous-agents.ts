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
/** Seeded by seedDatasets for test_org1. */
const OWN_DATASETS = ['sim-equipements-sportifs', 'sim-suivi-demandes', 'sim-demandes-subvention']

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
      description: 'a data tool was called on one of the organization\'s datasets',
      holds: exports => ['datafair_describe_dataset', 'datafair_search_data', 'datafair_aggregate_data', 'datafair_calculate_metric', 'datafair_get_field_values']
        .some(tool => calledTool(exports, tool, input => OWN_DATASETS.includes(input?.datasetId)))
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
