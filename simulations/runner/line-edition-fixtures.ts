/**
 * The datasets of the line edition experiment: a register an autonomous agent writes lines into, and
 * the communes referential its `commune` column is validated against.
 *
 * The register is deliberately demanding, so that a write that ignores its rules is refused rather
 * than silently accepted. Every rule below is one the API enforces on a REST line write (checked
 * against api/types/dataset/schema.js, shared/schema.js and the ajv validation of
 * api/src/datasets/utils/rest.ts, then verified live): `x-required`, restricted `x-labels` (also on
 * the multi-valued columns), `pattern` (the email included), `format: date`, `minimum`, the unicity and the
 * date coherence constraints. `patternErrorMessage` is kept for the message it gives, not as a rule.
 * Not a rule: `x-master` / `x-fromUrl` on `commune` only drive the editor's autocomplete, the API
 * accepts any string there; the bulk search extension fills `departement` and `population` after the
 * fact and refuses nothing.
 *
 * The referential stays private to the owner: master-data fetches must go through the caller's own
 * credentials, never through a public dataset.
 */
import { OWNER, OWNER_USER } from './settings.ts'

export const REFERENTIAL_ID = 'sim-communes-agglo'
export const REGISTER_TITLE = 'Lieux d\'activité des associations'

/** One register per run, so a run never reads the lines another one wrote. */
export function registerId (runName: string): string {
  const slug = runName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `sim-lieux-${slug}`
}

const codeCommuneConcept = 'http://rdf.insee.fr/def/geo#codeCommune'

const codeInsee = { key: 'code_insee', type: 'string', title: 'Code INSEE', 'x-refersTo': codeCommuneConcept }
const nomCommune = { key: 'nom', type: 'string', title: 'Nom' }

/** The communes of the Nantes area, plus Saint-Herblon: a near-homonym of Saint-Herblain, in the same department. */
const communes = [
  ['44109', 'Nantes', 318808],
  ['44162', 'Saint-Herblain', 50025],
  ['44143', 'Rezé', 43053],
  ['44190', 'Saint-Sébastien-sur-Loire', 27964],
  ['44114', 'Orvault', 27279],
  ['44215', 'Vertou', 25587],
  ['44020', 'Bouguenais', 20335],
  ['44026', 'Carquefou', 20278],
  ['44035', 'La Chapelle-sur-Erdre', 20142],
  ['44047', 'Couëron', 23058],
  ['44172', 'Sainte-Luce-sur-Loire', 15843],
  ['44165', 'Saint-Herblon', 2795]
] as const

/** _bulk_lines answers 200 even when lines are refused: a fixture line the register refuses would go unnoticed. */
async function bulkLines (ax: any, id: string, lines: Record<string, any>[]) {
  const { nbErrors, errors } = (await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, lines)).data
  if (nbErrors) throw new Error(`${nbErrors} fixture lines refused by ${id}: ${JSON.stringify(errors)}`)
}

async function seedReferential (ax: any) {
  await ax.put(`/api/v1/datasets/${REFERENTIAL_ID}`, {
    isRest: true,
    title: 'Communes de l\'agglomération',
    description: 'Référentiel des communes de l\'agglomération nantaise et de leurs codes INSEE.',
    schema: [
      codeInsee,
      nomCommune,
      { key: 'departement', type: 'string', title: 'Département' },
      { key: 'population', type: 'integer', title: 'Population' }
    ],
    masterData: {
      bulkSearchs: [{
        id: 'code-insee',
        title: 'Informations par code INSEE',
        input: [{ type: 'equals', property: codeInsee }]
      }],
      singleSearchs: [{
        id: 'commune',
        title: 'Recherche de commune',
        output: codeInsee,
        label: nomCommune
      }]
    }
  })
  await bulkLines(ax, REFERENTIAL_ID, communes.map(([code, nom, population]) => ({
    _id: code, code_insee: code, nom, departement: '44', population
  })))
}

/**
 * The remote service data-fair derives from the referential's master data, and the URL of its
 * single search. Same recipe as tests/features/ui/dataset-edit-data-master-data.e2e.spec.ts.
 * Reading a remote service by id is reserved to super admins, so `admin` does that read only;
 * everything else is written by the owner's admin.
 */
async function registerReferential (ax: any, admin: any) {
  const referential = (await ax.get(`/api/v1/datasets/${REFERENTIAL_ID}`)).data
  const apiDoc = (await ax.get(referential.href + '/api-docs.json')).data
  await ax.post('/api/v1/_check-api', apiDoc)
  const remoteService = (await admin.get(`/api/v1/remote-services/dataset:${REFERENTIAL_ID}`, { params: { showAll: true } })).data
  const singleSearch = remoteService.actions.find((a: any) => a.id === 'masterData_singleSearch_commune')
  if (!singleSearch) throw new Error(`the remote service of ${REFERENTIAL_ID} exposes no single search`)
  return { remoteService, singleSearch, singleSearchUrl: remoteService.server + singleSearch.operation.path }
}

const labels = (values: string[]) => Object.fromEntries(values.map(v => [v, v]))

function registerSchema (master: Awaited<ReturnType<typeof registerReferential>>) {
  return [
    { key: 'nom', type: 'string', title: 'Nom du lieu', 'x-required': true },
    { key: 'association', type: 'string', title: 'Association', 'x-required': true },
    {
      key: 'type_lieu',
      type: 'string',
      title: 'Type de lieu',
      'x-labels': labels(['gymnase', 'piscine', 'stade', 'salle polyvalente', 'plein air']),
      'x-labelsRestricted': true,
      'x-required': true
    },
    {
      key: 'commune',
      type: 'string',
      title: 'Commune',
      description: 'Code INSEE de la commune.',
      'x-refersTo': codeCommuneConcept,
      'x-required': true,
      'x-master': {
        id: `dataset:${REFERENTIAL_ID}--${master.singleSearch.id}`,
        title: master.singleSearch.summary,
        remoteService: master.remoteService.id,
        action: master.singleSearch.id
      },
      'x-fromUrl': master.singleSearchUrl + '?q={q}',
      'x-itemKey': 'output',
      'x-itemTitle': 'label',
      'x-itemsProp': 'results'
    },
    { key: 'adresse', type: 'string', title: 'Adresse' },
    {
      key: 'telephone',
      type: 'string',
      title: 'Téléphone',
      pattern: '^0[1-9]( \\d{2}){4}$',
      patternErrorMessage: 'Un numéro à 10 chiffres groupés par deux, par exemple 02 40 12 34 56.'
    },
    // a pattern: `format: email` is refused by the elasticsearch mapping when the dataset is created
    { key: 'email', type: 'string', title: 'Courriel', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', patternErrorMessage: 'Une adresse de courriel, par exemple contact@association.fr.' },
    { key: 'siret', type: 'string', title: 'SIRET', pattern: '^\\d{14}$', patternErrorMessage: 'Un SIRET compte 14 chiffres.' },
    {
      key: 'activites',
      type: 'string',
      title: 'Activités',
      separator: ', ',
      'x-labels': labels(['football', 'basket', 'natation', 'judo', 'handisport', 'yoga', 'danse', 'escalade']),
      'x-labelsRestricted': true
    },
    {
      key: 'publics',
      type: 'string',
      title: 'Publics',
      separator: ', ',
      'x-labels': labels(['enfants', 'adultes', 'seniors', 'personnes handicapées']),
      'x-labelsRestricted': true
    },
    { key: 'capacite', type: 'integer', title: 'Capacité', minimum: 0 },
    { key: 'accessible_pmr', type: 'boolean', title: 'Accessible PMR' },
    { key: 'date_ouverture', type: 'string', format: 'date', title: 'Date d\'ouverture', 'x-refersTo': 'https://schema.org/startDate', 'x-required': true },
    { key: 'date_fermeture', type: 'string', format: 'date', title: 'Date de fermeture', 'x-refersTo': 'https://schema.org/endDate' },
    { key: 'tarif_annuel', type: 'number', title: 'Tarif annuel (€)' }
  ]
}

/** The register's own columns, without the extension's. */
export const REGISTER_COLUMNS: string[] = ['nom', 'association', 'type_lieu', 'commune', 'adresse', 'telephone', 'email', 'siret',
  'activites', 'publics', 'capacite', 'accessible_pmr', 'date_ouverture', 'date_fermeture', 'tarif_annuel']

/**
 * The lines the register already has, all valid. The cases lean on three of them: `Gymnase de la
 * Bourgonnière` in 44162 is the one a case asks to add again, `Piscine Petite Amazonie` (its phone and
 * activities) and `Salle Jean Jaurès` (its closing date) are the ones a case asks to correct.
 */
const existingLines = [
  {
    _id: 'lieu-1',
    nom: 'Gymnase de la Bourgonnière',
    association: 'Saint-Herblain Basket Club',
    type_lieu: 'gymnase',
    commune: '44162',
    adresse: 'Rue de la Bourgonnière',
    telephone: '02 40 63 21 18',
    email: 'contact@shbc.fr',
    siret: '41234567800015',
    activites: 'basket',
    publics: 'enfants, adultes',
    capacite: 300,
    accessible_pmr: true,
    date_ouverture: '2019-09-02',
    tarif_annuel: 180
  },
  {
    _id: 'lieu-2',
    nom: 'Piscine Petite Amazonie',
    association: 'Nantes Natation',
    type_lieu: 'piscine',
    commune: '44109',
    adresse: '8 rue Gaston Michel',
    telephone: '02 40 29 47 85',
    email: 'accueil@nantes-natation.fr',
    siret: '38765432100021',
    activites: 'natation',
    publics: 'enfants, adultes, seniors',
    capacite: 450,
    accessible_pmr: true,
    date_ouverture: '2018-01-08',
    tarif_annuel: 220
  },
  {
    _id: 'lieu-3',
    nom: 'Salle Jean Jaurès',
    association: 'Judo Club Rezéen',
    type_lieu: 'salle polyvalente',
    commune: '44143',
    adresse: 'Place Jean Jaurès',
    telephone: '02 40 75 12 30',
    siret: '45678912300034',
    activites: 'judo, yoga',
    publics: 'enfants, adultes',
    capacite: 80,
    accessible_pmr: false,
    date_ouverture: '2020-09-07',
    date_fermeture: '2026-06-30',
    tarif_annuel: 150
  },
  {
    _id: 'lieu-4',
    nom: 'Stade de la Beaujoire',
    association: 'Football Club Nantes Est',
    type_lieu: 'stade',
    commune: '44109',
    adresse: 'Route de Saint-Joseph',
    email: 'secretariat@fcnantesest.fr',
    activites: 'football',
    publics: 'enfants, adultes',
    capacite: 1200,
    accessible_pmr: true,
    date_ouverture: '2015-08-24',
    tarif_annuel: 120
  },
  {
    _id: 'lieu-5',
    nom: 'Base de loisirs de la Loire',
    association: 'Escalade Sèvre et Loire',
    type_lieu: 'plein air',
    commune: '44190',
    adresse: 'Quai de la Loire',
    telephone: '06 12 34 56 78',
    activites: 'escalade',
    publics: 'adultes',
    capacite: 40,
    accessible_pmr: false,
    date_ouverture: '2021-04-01',
    date_fermeture: '2021-10-31'
  },
  {
    _id: 'lieu-6',
    nom: 'Salle de danse du Bourg',
    association: 'Danse Handi Valides 44',
    type_lieu: 'salle polyvalente',
    commune: '44162',
    adresse: 'Place du Bourg',
    email: 'dhv44@laposte.net',
    siret: '51234987600011',
    activites: 'danse, handisport',
    publics: 'personnes handicapées, adultes',
    capacite: 60,
    accessible_pmr: true,
    date_ouverture: '2022-01-10',
    tarif_annuel: 90
  }
]

/**
 * Seed the referential, then the register `id` and its existing lines, and wait for indexing. The
 * referential is seeded on every call: a run starts from clean(), which drops it.
 */
export async function seedLineEditionDatasets (id: string): Promise<void> {
  const { axiosAuth, waitForWorkerIdle } = await import('../../tests/support/axios.ts')
  const ax = await axiosAuth(`${OWNER_USER}@test.com`, OWNER.id)
  const admin = await axiosAuth('test_superadmin@test.com', undefined, true)

  await seedReferential(ax)
  // the register's extension needs the referential's lines indexed
  if (!await waitForWorkerIdle(120_000)) throw new Error(`${REFERENTIAL_ID} was still being processed after 120s`)
  const master = await registerReferential(ax, admin)

  await ax.put(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: REGISTER_TITLE,
    description: 'Lieux où les associations sportives de l\'agglomération exercent leurs activités.',
    rest: { history: true },
    schema: registerSchema(master),
    constraints: [{ type: 'unique', properties: ['nom', 'commune'] }, { type: 'dateCoherence' }],
    extensions: [{
      active: true,
      type: 'remoteService',
      remoteService: master.remoteService.id,
      action: 'masterData_bulkSearch_code-insee',
      select: ['departement', 'population']
    }]
  })
  await bulkLines(ax, id, existingLines)

  if (!await waitForWorkerIdle(120_000)) throw new Error(`${id} was still being processed after 120s; the agent would write into an unindexed register`)
}
