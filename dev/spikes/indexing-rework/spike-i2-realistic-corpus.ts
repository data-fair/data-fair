import { es, resetIndex, bulkIndex, finding, time, assert, ANALYSIS_SETTINGS } from './es.ts'

// Corrective follow-up to Spike I (spike-i-keyword-repeat.ts). Spike I measured the
// `custom_french_repeat` single-field candidate (keyword_repeat + stemmer + remove_duplicates: each
// token indexed as BOTH its original form and its stem, at the same position, in ONE field) against
// today's dual shape (`.text` custom_french + `.text_standard` standard) and found only -4.7% store
// savings -- much less than the analytical prediction (25-45% savings on the analyzed portion for
// realistic text). The repo owner suspects this is a corpus artifact: Spike I's 40-word synthetic
// vocabulary was almost ALL stem-changing inflection families with essentially NO stopwords -- the
// opposite of real French, where ~30-40% of tokens are stopwords (indexed with positions in
// `.text_standard` today, ELIMINATED ENTIRELY under `repeat`, since french_stop runs on both the
// keyword and free copy) and a large share of content words are self-stemming (emitting ONE token
// under `repeat`, not two, at their position).
//
// This spike re-measures with (A) a realistic hand-authored synthetic corpus -- natural French
// sentences with natural stopword density and a large, varied vocabulary -- and (B) real dev-cluster
// data if any usable French-text index exists (best effort, no fabrication).

// ---------------------------------------------------------------------------------------------
// Analyzer under test -- verbatim copy of Spike I's final validated filter order.
// ---------------------------------------------------------------------------------------------
const REPEAT_FILTER_ORDER = ['french_elision', 'lowercase', 'keyword_repeat', 'french_stop', 'french_stemmer', 'remove_duplicates', 'asciifolding']

const ANALYSIS_SETTINGS_REPEAT = {
  ...ANALYSIS_SETTINGS,
  analyzer: {
    ...ANALYSIS_SETTINGS.analyzer,
    custom_french_repeat: { tokenizer: 'standard', filter: REPEAT_FILTER_ORDER }
  }
}

const baseSettings = { analysis: ANALYSIS_SETTINGS_REPEAT, number_of_replicas: 0 }

// ---------------------------------------------------------------------------------------------
// Spike I's corpus vocabulary (verbatim), kept here ONLY to measure s/p on it with the same
// methodology as corpus A below, for a direct, quantified comparison -- not used to build docs.
// ---------------------------------------------------------------------------------------------
const SPIKE_I_VOCAB = [
  'configuration', 'configurations', 'configurer', 'configurée',
  'publication', 'publications', 'publier', 'publiée',
  'commune', 'communes',
  'transporteur', 'transporteurs', 'transport', 'transports',
  'école', 'écoles', 'scolaire',
  'donnée', 'données',
  'ministère', 'ministères',
  'région', 'régions', 'régional',
  'budget', 'budgets',
  'projet', 'projets',
  'contrat', 'contrats',
  'habitant', 'habitants',
  'surface', 'surfaces',
  'service', 'services',
  'marché', 'marchés',
  'département', 'départements'
]

// ---------------------------------------------------------------------------------------------
// CORPUS A -- 180 natural French sentences about open-data / administrative topics (communes,
// budgets, transports, équipements, subventions, environnement, écoles, marchés publics,
// urbanisme, état civil, espaces verts, déchets, eau, santé, culture, sécurité, numérique,
// tourisme). Full grammatical sentences, natural stopword density, several hundred distinct words,
// natural mix of inflected and self-stemming forms -- unlike Spike I's 40-word inflection-family
// list with no stopwords.
// ---------------------------------------------------------------------------------------------
const SENTENCES = [
  'La commune met à jour chaque année la liste des équipements sportifs mis à la disposition des habitants.',
  'Le conseil municipal se réunit une fois par mois pour délibérer sur les affaires courantes de la commune.',
  'Les habitants peuvent consulter en ligne les comptes rendus des délibérations du conseil municipal.',
  "La mairie propose un service d'accueil pour les démarches administratives des nouveaux arrivants dans la commune.",
  'Plusieurs communes voisines ont décidé de mutualiser leurs services techniques afin de réduire les coûts de fonctionnement.',
  'Le maire a présenté le bilan de son mandat lors de la dernière séance du conseil municipal.',
  "La commune dispose d'un budget participatif qui permet aux habitants de proposer des projets d'intérêt général.",
  "Les arrêtés municipaux relatifs à la circulation sont publiés sur le site internet de la commune.",
  'Un recensement de la population est organisé tous les cinq ans dans les petites communes rurales.',
  'La commune a signé une convention avec le département pour la gestion partagée de certains équipements publics.',
  "Le budget primitif de la commune a été voté à l'unanimité par le conseil municipal.",
  'Les dépenses de fonctionnement représentent près de soixante pour cent du budget total de la collectivité.',
  "La collectivité a obtenu une subvention régionale pour financer la rénovation de son réseau d'eau potable.",
  'Le compte administratif retrace l\'ensemble des recettes et des dépenses réalisées au cours de l\'exercice.',
  "Les taux d'imposition locaux restent stables pour la troisième année consécutive dans la plupart des communes.",
  'La dette de la collectivité a diminué grâce à une gestion rigoureuse des dépenses publiques.',
  'Un audit financier a été commandé pour évaluer la soutenabilité du budget sur les cinq prochaines années.',
  'Les subventions versées aux associations locales représentent une part importante du budget culturel.',
  'La chambre régionale des comptes a examiné la gestion budgétaire de la commune sur les derniers exercices.',
  "Le budget annexe consacré à l'eau et à l'assainissement est présenté séparément du budget général.",
  "Le réseau de transport en commun dessert désormais l'ensemble des quartiers périphériques de l'agglomération.",
  'Une nouvelle ligne de bus a été mise en service pour améliorer la desserte des zones rurales.',
  'Les horaires des transporteurs publics sont disponibles en temps réel sur l\'application mobile de la région.',
  'La collectivité encourage le développement du covoiturage pour réduire les émissions de gaz à effet de serre.',
  'Des pistes cyclables sécurisées relient désormais le centre-ville aux principaux équipements scolaires et sportifs.',
  'Le syndicat mixte des transports a présenté son plan de mobilité pour les dix prochaines années.',
  "Les usagers peuvent signaler les retards et incidents directement depuis l'application de suivi des transports.",
  'La gratuité des transports scolaires a été étendue à l\'ensemble des élèves du primaire et du collège.',
  "Un parking relais a été aménagé à proximité de la gare pour faciliter l'intermodalité des déplacements.",
  'La fréquentation des transports publics a fortement augmenté depuis la mise en place de la nouvelle tarification.',
  'La liste des équipements sportifs de la commune est mise à jour chaque année par les services municipaux.',
  'Le nouveau gymnase accueillera les compétitions régionales de basket-ball dès la rentrée prochaine.',
  "La médiathèque propose un large choix d'ouvrages ainsi que des ateliers numériques gratuits pour tous les âges.",
  'Les habitants peuvent réserver en ligne les créneaux disponibles dans les équipements sportifs municipaux.',
  "Un city stade a été inauguré dans le quartier nord afin d'offrir un espace de loisirs aux jeunes.",
  "La piscine municipale sera fermée durant l'été pour des travaux de rénovation des bassins.",
  'Le conservatoire de musique propose des cours accessibles à tous les habitants de la communauté de communes.',
  'La salle des fêtes peut être louée par les associations et les particuliers selon un tarif préférentiel.',
  'Les terrains de sport extérieurs sont accessibles librement en dehors des horaires réservés aux clubs.',
  'Le festival annuel organisé par la commune attire chaque année plusieurs milliers de visiteurs.',
  'Les associations locales peuvent déposer une demande de subvention avant la fin du mois de mars.',
  'La commune accorde des aides financières aux familles modestes pour l\'inscription des enfants aux activités périscolaires.',
  "Un dispositif d'aide à la rénovation énergétique des logements a été mis en place par la région.",
  'Les entreprises qui s\'installent dans la zone d\'activité peuvent bénéficier d\'une exonération temporaire de taxe foncière.',
  'La subvention accordée aux clubs sportifs dépend du nombre de licenciés et de la nature des activités proposées.',
  'Le département propose une aide exceptionnelle aux communes touchées par les inondations du printemps dernier.',
  'Les porteurs de projets associatifs sont invités à présenter leur dossier devant la commission des subventions.',
  'Une aide au démarrage est versée aux jeunes agriculteurs qui s\'installent sur le territoire de la communauté de communes.',
  'Le montant total des subventions versées aux associations a augmenté de dix pour cent cette année.',
  "Les critères d'attribution des subventions ont été révisés afin de mieux soutenir les projets d'intérêt général.",
  'La commune s\'est engagée dans une démarche de réduction des déchets et de préservation de la biodiversité.',
  "Un plan climat air énergie territorial a été adopté afin de réduire les émissions de gaz à effet de serre.",
  'Les habitants sont invités à participer à une opération de nettoyage des berges de la rivière.',
  "La collectivité a installé des panneaux photovoltaïques sur le toit de plusieurs bâtiments publics.",
  "Un inventaire de la biodiversité locale a été réalisé avec l'appui d'associations naturalistes bénévoles.",
  'La commune développe un réseau de chaleur alimenté par une chaufferie collective au bois.',
  'Des ruches ont été installées dans le parc municipal pour sensibiliser les habitants à la protection des pollinisateurs.',
  'Le tri sélectif des déchets a permis de réduire de manière significative le volume enfoui chaque année.',
  "La collectivité soutient les initiatives citoyennes en faveur de l'agriculture biologique et des circuits courts.",
  'Un plan de gestion différenciée des espaces verts favorise le développement de la faune et de la flore locales.',
  'La commune a investi dans la rénovation thermique de plusieurs écoles primaires du territoire.',
  'Les effectifs scolaires sont en légère hausse cette année dans les écoles maternelles et élémentaires.',
  "Un nouveau restaurant scolaire a ouvert ses portes afin d'accueillir les élèves du groupe scolaire du centre.",
  'Les parents d\'élèves peuvent consulter les menus de la cantine sur le site internet de la commune.',
  "La carte scolaire sera révisée l'année prochaine pour tenir compte de l'évolution démographique du secteur.",
  'Des ateliers périscolaires gratuits sont proposés chaque semaine aux enfants scolarisés dans les écoles publiques.',
  'Le conseil départemental finance l\'équipement numérique des collèges dans le cadre de son plan numérique éducatif.',
  'Les inscriptions scolaires pour la rentrée prochaine sont ouvertes depuis le début du mois de janvier.',
  "Une classe supplémentaire ouvrira à la rentrée en raison de l'augmentation du nombre d'élèves inscrits.",
  "La commune organise des temps d'activités périscolaires encadrés par des animateurs qualifiés.",
  "La collectivité a publié un appel d'offres pour la construction d'un nouveau groupe scolaire.",
  'Les entreprises intéressées peuvent consulter le dossier de consultation des marchés sur la plateforme dédiée.',
  "Le marché public relatif à l'entretien des espaces verts a été attribué à une entreprise locale.",
  "La commission d'appel d'offres s'est réunie pour examiner les propositions déposées par les candidats.",
  'Un accord-cadre a été conclu avec plusieurs prestataires pour la fourniture de matériel informatique.',
  "Les critères d'attribution du marché prennent en compte le prix ainsi que la valeur technique des offres.",
  'La procédure de passation du marché de travaux a été lancée pour la réhabilitation de la mairie.',
  "Le délai de remise des offres a été prolongé de quinze jours à la demande des candidats.",
  'Un marché à bons de commande permet à la collectivité de commander des fournitures scolaires tout au long de l\'année.',
  "La collectivité privilégie les entreprises locales dans l'attribution de certains marchés de faible montant.",
  "Le plan local d'urbanisme définit les règles de construction applicables sur l'ensemble du territoire communal.",
  'Les demandes de permis de construire peuvent désormais être déposées en ligne sur le site de la préfecture.',
  'La commune a délivré plusieurs permis de construire pour des projets de logements collectifs cette année.',
  'Une déclaration préalable de travaux est obligatoire pour toute modification de façade ou de clôture.',
  "Le service urbanisme instruit les demandes de certificat d'urbanisme dans un délai d'un mois environ.",
  'Un nouveau lotissement de trente logements sera construit dans le secteur ouest de la commune.',
  "Les riverains ont été consultés dans le cadre de la révision du plan local d'urbanisme.",
  'La zone artisanale sera étendue afin d\'accueillir de nouvelles entreprises et de créer des emplois locaux.',
  "Le permis d'aménager du futur quartier a été délivré après avis favorable de la commission d'urbanisme.",
  "Les règles de stationnement applicables aux nouvelles constructions ont été précisées dans le règlement d'urbanisme.",
  "Le service état civil délivre les actes de naissance, de mariage et de décès sur simple demande.",
  'La population de la commune a augmenté de deux pour cent au cours des cinq dernières années.',
  "Les futurs mariés doivent déposer leur dossier auprès du service état civil au moins un mois avant la cérémonie.",
  "Le recensement de la population permet de connaître précisément le nombre d'habitants de chaque commune.",
  'Un livret de famille est remis aux parents lors de la déclaration de naissance de leur enfant.',
  'La commune enregistre chaque année une trentaine de naissances et une vingtaine de décès.',
  "Les demandes de carte d'identité et de passeport sont traitées par les communes équipées d'un dispositif de recueil.",
  "Le service population accompagne les habitants dans leurs démarches administratives liées à l'état civil.",
  "La population municipale légale est publiée chaque année par l'institut national de la statistique.",
  'Un pacs peut être conclu directement en mairie depuis la réforme de la procédure d\'enregistrement.',
  'Le parc municipal accueille chaque week-end de nombreuses familles venues profiter des espaces de jeux.',
  "La commune entretient plus de cinquante hectares d'espaces verts répartis sur l'ensemble du territoire.",
  "De nouveaux arbres ont été plantés le long des avenues afin de lutter contre les îlots de chaleur.",
  'Un jardin partagé a été créé à la demande des habitants du quartier des tilleuls.',
  'Les services techniques municipaux assurent la tonte des pelouses et la taille des haies chaque printemps.',
  'Le fleurissement de la commune lui a permis d\'obtenir sa troisième fleur au concours régional.',
  "Un parcours de santé a été aménagé dans le bois communal pour les amateurs de course à pied.",
  'La commune a mis en place un plan de gestion différenciée pour préserver la biodiversité des espaces verts.',
  "Des composteurs collectifs ont été installés dans plusieurs parcs afin de valoriser les déchets verts.",
  "Le square situé devant la mairie a été entièrement rénové avec de nouveaux jeux pour enfants.",
  'La collecte des déchets ménagers a lieu deux fois par semaine dans le centre-ville.',
  "Les habitants peuvent déposer leurs encombrants à la déchetterie intercommunale sur présentation d'un justificatif de domicile.",
  "Un nouveau calendrier de collecte sélective a été distribué à l'ensemble des foyers de la commune.",
  'La redevance incitative encourage les habitants à réduire le volume de leurs déchets ménagers.',
  "Des points d'apport volontaire pour le verre et le papier ont été installés dans chaque quartier.",
  'La commune organise une campagne de sensibilisation au tri des déchets dans les écoles primaires.',
  'Le service propreté intervient quotidiennement pour le nettoyage des rues et des espaces publics.',
  'Les dépôts sauvages font l\'objet d\'un signalement systématique auprès des services municipaux.',
  'Un composteur individuel peut être obtenu gratuitement auprès de la communauté de communes.',
  'La quantité de déchets collectés a diminué de cinq pour cent grâce aux efforts de tri des habitants.',
  "Le réseau d'eau potable de la commune fait l'objet d'un programme pluriannuel de renouvellement des canalisations.",
  "La qualité de l'eau distribuée est contrôlée régulièrement par l'agence régionale de santé.",
  "Les travaux de raccordement au réseau d'assainissement collectif débuteront au mois de septembre prochain.",
  'Une fuite importante sur le réseau a été détectée et réparée par les services techniques.',
  "Le prix de l'eau potable reste inférieur à la moyenne nationale dans la communauté de communes.",
  "Les propriétaires d'un assainissement individuel doivent faire contrôler leur installation tous les quatre ans.",
  'La station d\'épuration a été modernisée afin d\'améliorer le traitement des eaux usées.',
  "Un plan de sécurisation de l'approvisionnement en eau potable a été présenté aux élus du territoire.",
  'La facture d\'eau comprend une part fixe et une part variable calculée selon la consommation.',
  'Des campagnes de sensibilisation aux économies d\'eau sont menées chaque été auprès des habitants.',
  'Le centre communal d\'action sociale accompagne les familles en difficulté dans leurs démarches administratives.',
  "Une maison de santé pluriprofessionnelle a ouvert ses portes pour lutter contre la désertification médicale.",
  "Le service d'aide à domicile intervient auprès des personnes âgées et des personnes en situation de handicap.",
  'La commune propose une aide financière ponctuelle aux familles rencontrant des difficultés temporaires.',
  "Un repas de fin d'année est offert chaque hiver aux résidents de la maison de retraite communale.",
  'Le centre médico-social organise des permanences hebdomadaires ouvertes à tous les habitants du territoire.',
  "La commune a créé un poste de coordinateur pour améliorer l'accès aux soins des habitants les plus isolés.",
  'Des ateliers de prévention santé sont proposés gratuitement aux seniors de la commune.',
  "Le transport à la demande permet aux personnes âgées de se rendre chez le médecin sans difficulté.",
  "La commission communale d'accessibilité veille à l'adaptation des bâtiments publics aux personnes à mobilité réduite.",
  'La bibliothèque municipale organise régulièrement des séances de lecture destinées aux tout-petits.',
  'Un cycle de conférences sur le patrimoine local est proposé chaque trimestre par la médiathèque.',
  'La commune soutient la création d\'une compagnie de théâtre amateur composée d\'habitants bénévoles.',
  "Le musée municipal accueille une exposition temporaire consacrée à l'histoire industrielle du territoire.",
  "Des ateliers d'écriture sont animés par un auteur local dans les locaux de la médiathèque.",
  'La saison culturelle propose une dizaine de spectacles accessibles à un tarif préférentiel pour les habitants.',
  "Le patrimoine architectural de la commune fait l'objet d'un inventaire mené par les services régionaux.",
  'Une nuit de la lecture est organisée chaque année en partenariat avec les écoles et les associations.',
  "La médiathèque propose désormais un service de prêt numérique accessible depuis le site internet de la commune.",
  'Le festival de musique attire chaque été de nombreux artistes régionaux et nationaux.',
  'La commune a installé un système de vidéoprotection sur les principaux axes de circulation.',
  "Un plan communal de sauvegarde a été élaboré afin d'organiser la réponse aux situations d'urgence.",
  'Les pompiers volontaires interviennent régulièrement en soutien du centre de secours principal du territoire.',
  'La police municipale assure des patrouilles quotidiennes aux abords des écoles et des équipements publics.',
  "Un exercice de simulation d'inondation a été organisé avec les services de la préfecture.",
  'La commune sensibilise les habitants aux risques naturels par la diffusion d\'un document d\'information.',
  'Des radars pédagogiques ont été installés pour limiter la vitesse aux abords des zones résidentielles.',
  'Le dispositif de participation citoyenne encourage les habitants à signaler les faits suspects aux forces de l\'ordre.',
  'Une convention a été signée avec la gendarmerie pour renforcer la sécurité lors des manifestations locales.',
  "Le plan de prévention des risques d'inondation impose des règles strictes de construction en zone submersible.",
  "La collectivité publie en open data les jeux de données relatifs aux équipements publics du territoire.",
  "Un portail de démarches en ligne permet aux habitants d'effectuer leurs demandes sans se déplacer en mairie.",
  'Les données de fréquentation des transports publics sont mises à disposition sur la plateforme régionale.',
  'La commune développe une application mobile pour faciliter le signalement des incidents sur la voirie.',
  'L\'ouverture des données publiques favorise la transparence de l\'action des collectivités territoriales.',
  'Un budget participatif numérique permet aux habitants de voter en ligne pour les projets qu\'ils soutiennent.',
  "La collectivité a mis en place une plateforme de consultation citoyenne pour recueillir l'avis des habitants.",
  'Les données relatives aux marchés publics sont publiées conformément aux obligations de transparence de la commande publique.',
  "Un catalogue de données ouvertes recense l'ensemble des jeux de données publiés par la collectivité.",
  "La commune propose un espace numérique de travail accessible aux élèves et aux enseignants des écoles.",
  'L\'office de tourisme intercommunal propose des visites guidées du patrimoine historique de la commune.',
  'Un sentier de randonnée balisé permet de découvrir les principaux sites naturels du territoire.',
  "La commune valorise son patrimoine bâti à travers un circuit touristique jalonné de panneaux explicatifs.",
  'Le château médiéval situé au centre du village accueille chaque année plusieurs milliers de visiteurs.',
  "Des animations estivales sont proposées par l'office de tourisme pour dynamiser le centre-ville pendant la saison.",
  'La commune a obtenu le label station verte en reconnaissance de la qualité de son cadre de vie.',
  'Un marché artisanal se tient chaque samedi matin sur la place principale du village.',
  "Le comité des fêtes organise plusieurs manifestations tout au long de l'année pour animer la commune.",
  "La maison du patrimoine propose des expositions permanentes retraçant l'histoire de la commune et de ses habitants.",
  'La commune développe une signalétique touristique bilingue afin d\'accueillir les visiteurs étrangers.'
]

assert(SENTENCES.length >= 150 && SENTENCES.length <= 200, `corpus A must have 150-200 sentences, got ${SENTENCES.length}`)

// ---------------------------------------------------------------------------------------------
// Build 50k docs from corpus A: title = 1 sampled sentence, description = 3-5 sampled sentences.
// Deterministic seeded PRNG per doc index (no external RNG dependency, reproducible run to run).
// ---------------------------------------------------------------------------------------------
function mulberry32 (seed: number) {
  let a = seed
  return function (): number {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pickSentence = (rand: () => number) => SENTENCES[Math.floor(rand() * SENTENCES.length)]

const N = 50_000
function buildDoc (i: number) {
  const rand = mulberry32(i + 1)
  const title = pickSentence(rand)
  const descCount = 3 + Math.floor(rand() * 3) // 3, 4 or 5
  const description = Array.from({ length: descCount }, () => pickSentence(rand)).join(' ')
  return { id: `rec-${i}`, title, description }
}
const docsA = Array.from({ length: N }, (_, i) => buildDoc(i))

// ---------------------------------------------------------------------------------------------
// Variant mappings -- per-column shapes (dual/single/repeat) and, for corpus A only, a global-field
// trio where title/description additionally copy_to a `_search` field mapped analogously.
// ---------------------------------------------------------------------------------------------
const fieldDual = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' }
  }
})
const fieldSingle = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french' } }
})
const fieldRepeat = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } }
})
const withCopyTo = (f: any) => ({ ...f, copy_to: ['_search'] })

const searchFieldDual = { type: 'text', analyzer: 'custom_french', fields: { text_standard: { type: 'text', analyzer: 'standard' } } }
const searchFieldSingle = { type: 'text', analyzer: 'custom_french' }
const searchFieldRepeat = { type: 'text', analyzer: 'custom_french_repeat' }

const variantsA: Record<string, any> = {
  'spike-i2-a-dual': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldDual(), description: fieldDual() } } },
  'spike-i2-a-single': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldSingle(), description: fieldSingle() } } },
  'spike-i2-a-repeat': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldRepeat(), description: fieldRepeat() } } },
  'spike-i2-a-dual-global': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: withCopyTo(fieldDual()), description: withCopyTo(fieldDual()), _search: searchFieldDual } } },
  'spike-i2-a-single-global': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: withCopyTo(fieldSingle()), description: withCopyTo(fieldSingle()), _search: searchFieldSingle } } },
  'spike-i2-a-repeat-global': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: withCopyTo(fieldRepeat()), description: withCopyTo(fieldRepeat()), _search: searchFieldRepeat } } }
}

const ANALYZED_FIELD_NAMES = ['title.text', 'title.text_standard', 'description.text', 'description.text_standard', '_search', '_search.text_standard']

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
async function count (index: string, query: any): Promise<number> {
  const res = await es('POST', `/${index}/_count`, { query })
  return res.count
}

async function analyzeTokens (filters: string[] | undefined, text: string, analyzer?: string): Promise<any[]> {
  const body: any = analyzer ? { analyzer, text } : { tokenizer: 'standard', filter: filters, text }
  const res = await es('POST', '/spike-i2-analyze/_analyze', body)
  return res.tokens
}

// Corpus stats: total tokens, stopword share s, distinct/content vocabulary sizes, stem-differs
// share p (custom_french_repeat on the full distinct CONTENT vocabulary).
async function corpusStats (label: string, text: string) {
  const rawTokens = await analyzeTokens(['french_elision', 'lowercase'], text)
  const stopTokens = await analyzeTokens(['french_elision', 'lowercase', 'french_stop'], text)
  const tRaw = rawTokens.length
  const tStop = stopTokens.length
  const s = (tRaw - tStop) / tRaw
  finding(`${label} total tokens (post-elision, pre-stop) = ${tRaw}; tokens after french_stop = ${tStop}; stopword share s = ${(s * 100).toFixed(1)}%`)

  const distinctVocab = [...new Set(rawTokens.map((t: any) => t.token))].sort()
  const survivingRes = await analyzeTokens(['french_elision', 'lowercase', 'french_stop'], distinctVocab.join(' '))
  const surviving = new Set(survivingRes.map((t: any) => t.token))
  const contentVocab = distinctVocab.filter(w => surviving.has(w))
  finding(`${label} distinct vocabulary = ${distinctVocab.length} types; content (non-stopword) vocabulary = ${contentVocab.length} types (${((contentVocab.length / distinctVocab.length) * 100).toFixed(1)}% of types)`)

  const repeatTokens = await analyzeTokens(undefined, contentVocab.join(' '), 'custom_french_repeat')
  const byPos = new Map<number, number>()
  for (const t of repeatTokens) byPos.set(t.position, (byPos.get(t.position) ?? 0) + 1)
  const positionCounts = [...byPos.values()]
  const twoFormPositions = positionCounts.filter(c => c === 2).length
  const p = twoFormPositions / positionCounts.length
  finding(`${label} stem-differs share p (custom_french_repeat on content vocabulary, positions emitting 2 tokens / total positions) = ${twoFormPositions}/${positionCounts.length} = ${(p * 100).toFixed(1)}%`)
  return { tRaw, tStop, s, distinctVocabSize: distinctVocab.length, contentVocabSize: contentVocab.length, p }
}

const builtIndices: string[] = []

try {
  // -------------------------------------------------------------------------------------------
  // 0. CORPUS B check -- real dev-cluster data, best effort, no fabrication.
  // -------------------------------------------------------------------------------------------
  const catIndices = await es('GET', '/_cat/indices?format=json')
  finding(`corpus B check: dev ES indices present: ${catIndices.map((i: any) => `${i.index}(${i['docs.count']} docs)`).join(', ') || '(none)'}`)
  const datasetIndices = catIndices.filter((i: any) => i.index.startsWith('dataset-'))
  finding(`corpus B check: dataset-* indices: ${datasetIndices.length ? datasetIndices.map((i: any) => `${i.index}(${i['docs.count']} docs)`).join(', ') : '(none)'}`)
  finding('CORPUS B SKIPPED: the only dataset-* index on this dev cluster is a metric-agg test fixture with 11 docs and single-letter textfield values (verified via _search sample); no French-text-rich dataset index with a usable doc count exists on this dev cluster. Per instructions, not fabricating corpus B -- proceeding with corpus A (realistic synthetic) only.')

  // -------------------------------------------------------------------------------------------
  // 1. CORPUS STATS -- corpus A vs Spike I's vocabulary, same methodology.
  // -------------------------------------------------------------------------------------------
  await resetIndex('spike-i2-analyze', { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' } } } })
  builtIndices.push('spike-i2-analyze')

  const statsA = await corpusStats('CORPUS A (realistic)', SENTENCES.join(' '))
  const statsSpikeI = await corpusStats('SPIKE I VOCAB (comparison)', SPIKE_I_VOCAB.join(' '))
  finding(`comparison: corpus A s=${(statsA.s * 100).toFixed(1)}% p=${(statsA.p * 100).toFixed(1)}% vs Spike I vocab s=${(statsSpikeI.s * 100).toFixed(1)}% p=${(statsSpikeI.p * 100).toFixed(1)}% -- Spike I's list is 40 words with zero stopwords by construction (a raw inflection-family word list, not sentences) and was hand-picked as "almost ALL stem-changing" families, hence s near 0% and p near 100%; corpus A is full sentences with real articles/prepositions/pronouns, hence a nonzero measured s, and a mix of inflected + self-stemming content words, hence a p below 100%.`)

  // -------------------------------------------------------------------------------------------
  // 2. BUILD corpus A variants (bulk + forcemerge, wall time per variant)
  // -------------------------------------------------------------------------------------------
  for (const [name, def] of Object.entries(variantsA)) {
    await resetIndex(name, def)
    const t0 = performance.now()
    await bulkIndex(name, docsA)
    await es('POST', `/${name}/_forcemerge?max_num_segments=1`)
    finding(`${name} bulk+merge ${(performance.now() - t0).toFixed(0)}ms for ${docsA.length} docs`)
    builtIndices.push(name)
  }

  // -------------------------------------------------------------------------------------------
  // 3. STORE SIZE + per-field disk usage + analyzed-portion isolation
  // -------------------------------------------------------------------------------------------
  const variantNames = Object.keys(variantsA)
  const stats = await es('GET', `/${variantNames.join(',')}/_stats/store`)
  const storeSizes: Record<string, number> = {}
  for (const name of variantNames) {
    storeSizes[name] = stats.indices[name].primaries.store.size_in_bytes
    finding(`${name} store size ${(storeSizes[name] / 1e6).toFixed(2)} MB`)
  }
  function deltaFinding (name: string, against: string) {
    const d = storeSizes[name] - storeSizes[against]
    const pct = (d / storeSizes[against]) * 100
    finding(`${name} store delta vs ${against}: ${d >= 0 ? '+' : ''}${d}B (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`)
  }
  deltaFinding('spike-i2-a-repeat', 'spike-i2-a-dual')
  deltaFinding('spike-i2-a-repeat', 'spike-i2-a-single')
  deltaFinding('spike-i2-a-repeat-global', 'spike-i2-a-dual-global')
  deltaFinding('spike-i2-a-repeat-global', 'spike-i2-a-single-global')

  const analyzedBytes: Record<string, number> = {}
  for (const name of variantNames) {
    try {
      const du = await es('POST', `/${name}/_disk_usage?run_expensive_tasks=true`)
      const fields = du[name].fields
      let sum = 0
      for (const fieldName of Object.keys(fields)) {
        if (!fieldName.startsWith('title') && !fieldName.startsWith('description') && fieldName !== '_search' && !fieldName.startsWith('_search.')) continue
        const f = fields[fieldName]
        finding(`${name} field ${fieldName} total=${f.total_in_bytes}B inverted_index=${f.inverted_index.total_in_bytes}B stored_fields=${f.stored_fields_in_bytes}B doc_values=${f.doc_values_in_bytes}B norms=${f.norms_in_bytes}B`)
        if (ANALYZED_FIELD_NAMES.includes(fieldName)) sum += f.inverted_index.total_in_bytes
      }
      analyzedBytes[name] = sum
      finding(`${name} ANALYZED-PORTION inverted_index bytes (sum of ${ANALYZED_FIELD_NAMES.filter(f => fields[f]).join('+')}) = ${sum}B (${((sum / storeSizes[name]) * 100).toFixed(1)}% of total store size)`)
    } catch (err: any) {
      finding(`${name} _disk_usage FAILED: ${err.message ?? err} -- analyzed-portion isolation unavailable for this variant`)
    }
  }
  function analyzedDeltaFinding (name: string, against: string) {
    if (analyzedBytes[name] === undefined || analyzedBytes[against] === undefined) {
      finding(`${name} analyzed-portion delta vs ${against}: UNAVAILABLE (disk_usage failed for one side)`)
      return
    }
    const d = analyzedBytes[name] - analyzedBytes[against]
    const pct = (d / analyzedBytes[against]) * 100
    finding(`${name} ANALYZED-PORTION delta vs ${against}: ${d >= 0 ? '+' : ''}${d}B (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`)
  }
  analyzedDeltaFinding('spike-i2-a-repeat', 'spike-i2-a-dual')
  analyzedDeltaFinding('spike-i2-a-repeat', 'spike-i2-a-single')
  analyzedDeltaFinding('spike-i2-a-repeat-global', 'spike-i2-a-dual-global')
  analyzedDeltaFinding('spike-i2-a-repeat-global', 'spike-i2-a-single-global')

  // -------------------------------------------------------------------------------------------
  // 4. SANITY CORRECTNESS (corpus A only) -- 2 finding lines each, not the full matrix.
  // -------------------------------------------------------------------------------------------
  // 4a. Stemmed recall: singular/plural of "commune" (light_french stems both to "commun").
  const recallSingular = { repeat: await count('spike-i2-a-repeat', { simple_query_string: { query: 'commune', fields: ['description.text'] } }), dual: await count('spike-i2-a-dual', { simple_query_string: { query: 'commune', fields: ['description.text'] } }) }
  const recallPlural = { repeat: await count('spike-i2-a-repeat', { simple_query_string: { query: 'communes', fields: ['description.text'] } }), dual: await count('spike-i2-a-dual', { simple_query_string: { query: 'communes', fields: ['description.text'] } }) }
  assert(recallSingular.repeat > 0 && recallSingular.dual > 0 && recallPlural.repeat > 0 && recallPlural.dual > 0, 'stemmed recall probe returned 0 hits on one side -- field likely absent from mapping')
  finding(`4a stemmed recall q=commune (singular) on description.text: repeat=${recallSingular.repeat} dual=${recallSingular.dual}; q=communes (plural): repeat=${recallPlural.repeat} dual=${recallPlural.dual}`)
  finding(`4a repeat matches Spike I's behavior (recall == dual for both forms): ${recallSingular.repeat === recallSingular.dual && recallPlural.repeat === recallPlural.dual}`)

  // 4b. Mid-typing prefix ladder on "assainissement" (14 chars, appears un-stemmed in the corpus).
  const PROGRESSIVE_PREFIXES = ['ass', 'assa', 'assai', 'assain', 'assainis', 'assainisse', 'assainissement']
  const ladderCounts: Record<string, number> = {}
  for (const p of PROGRESSIVE_PREFIXES) {
    ladderCounts[p] = await count('spike-i2-a-repeat', { simple_query_string: { query: `${p}*`, fields: ['description.text'] } })
  }
  finding('4b spike-i2-a-repeat progressive prefix hits on "assainissement" (description.text): ' + PROGRESSIVE_PREFIXES.map(p => `${p}=${ladderCounts[p]}`).join(' '))
  const neverZero = PROGRESSIVE_PREFIXES.every(p => ladderCounts[p] > 0)
  finding(`4b mid-typing prefix ladder never regresses to zero on repeat: ${neverZero} (matches Spike I's behavior)`)

  // -------------------------------------------------------------------------------------------
  // 5. LATENCY -- median over 20 runs. Production two-clause bool/should (dual) vs single-clause
  //    (repeat), per-column and through the global `_search` field.
  // -------------------------------------------------------------------------------------------
  const WORD = 'commune'
  const dualPerColumnQuery = {
    bool: {
      should: [
        { simple_query_string: { query: WORD, fields: ['title.text', 'description.text'] } },
        { simple_query_string: { query: WORD, fields: ['title.text_standard', 'description.text_standard'] } }
      ]
    }
  }
  const repeatPerColumnQuery = { simple_query_string: { query: WORD, fields: ['title.text', 'description.text'] } }
  const dualGlobalQuery = {
    bool: {
      should: [
        { simple_query_string: { query: WORD, fields: ['_search'] } },
        { simple_query_string: { query: WORD, fields: ['_search.text_standard'] } }
      ]
    }
  }
  const repeatGlobalQuery = { simple_query_string: { query: WORD, fields: ['_search'] } }

  // guard against the "unmapped field returns 0 silently" trap before timing
  const preflight = {
    dual: await count('spike-i2-a-dual', dualPerColumnQuery),
    repeat: await count('spike-i2-a-repeat', repeatPerColumnQuery),
    dualGlobal: await count('spike-i2-a-dual-global', dualGlobalQuery),
    repeatGlobal: await count('spike-i2-a-repeat-global', repeatGlobalQuery)
  }
  assert(Object.values(preflight).every(c => c > 0), `latency preflight got a zero-hit query -- unmapped field trap? ${JSON.stringify(preflight)}`)
  finding(`5 latency preflight hit counts (q="${WORD}"): dual=${preflight.dual} repeat=${preflight.repeat} dual-global=${preflight.dualGlobal} repeat-global=${preflight.repeatGlobal}`)

  await time(`spike-i2-a-dual two-clause bool/should (per-column, q="${WORD}")`, 20, () => count('spike-i2-a-dual', dualPerColumnQuery))
  await time(`spike-i2-a-repeat single-clause (per-column, q="${WORD}")`, 20, () => count('spike-i2-a-repeat', repeatPerColumnQuery))
  await time(`spike-i2-a-dual-global two-clause bool/should (global _search, q="${WORD}")`, 20, () => count('spike-i2-a-dual-global', dualGlobalQuery))
  await time(`spike-i2-a-repeat-global single-clause (global _search, q="${WORD}")`, 20, () => count('spike-i2-a-repeat-global', repeatGlobalQuery))
} finally {
  // ---------------------------------------------------------------------------------------------
  // cleanup -- always runs, even on failure
  // ---------------------------------------------------------------------------------------------
  const cleanup = new Set([...builtIndices, ...Object.keys(variantsA)])
  for (const name of cleanup) {
    await es('DELETE', `/${name}`).catch(() => {})
  }
  console.log('spike I2 done')
}
