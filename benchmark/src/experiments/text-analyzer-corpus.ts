// Realistic French corpus for the `text-analyzer` experiment.
//
// Why not the harness generator: `generator.ts` builds analyzed columns by joining 3-6 words
// drawn from a 26-noun list — no stopwords, no articles, no elision, no verb/adjective
// inflection. An A/B of French analyzers on that text is meaningless: `french_stop` has nothing
// to remove and `french_stemmer` has nothing to stem, so `custom_french`,
// `custom_french_repeat` and `standard` would emit nearly the same token stream and the size /
// latency deltas would all collapse to noise.
//
// So this module carries its own corpus: natural French sentences about open-data topics
// (dataset descriptions, administrative prose), with slots filled from commune / organisation /
// theme / year vocabularies. That gives all three properties the comparison needs:
//   - natural stopword density (le, la, des, dans, qui, pour, sur, par, une, est, ont, …),
//   - real inflection (plurals, conjugated verbs, agreed adjectives) so stemming actually fires,
//   - elision forms (l'eau, d'entreprises, qu'ils) so `french_elision` is exercised.
// The measured stats of the generated docs (stopword density, share of positions where the stem
// differs from the surface form) are reported with the experiment results, so the numbers can
// never be read without the corpus they came from.

import { mulberry32 } from '../generator.ts'

/** Commune names — high-cardinality proper nouns the stemmer must leave alone. */
const COMMUNES = [
  'Bordeaux', 'Lyon', 'Marseille', 'Nantes', 'Toulouse', 'Rennes', 'Strasbourg', 'Lille',
  'Montpellier', 'Grenoble', 'Dijon', 'Angers', 'Le Mans', 'Reims', 'Brest', 'Tours',
  'Amiens', 'Limoges', 'Perpignan', 'Metz', 'Besançon', 'Orléans', 'Rouen', 'Mulhouse',
  'Caen', 'Nancy', 'Argenteuil', 'Roubaix', 'Avignon', 'Poitiers', 'Nîmes', 'Clermont-Ferrand',
  'Aix-en-Provence', 'Saint-Étienne', 'Villeurbanne', 'Le Havre', 'Toulon', 'Annecy', 'Valence',
  'Chambéry', 'Pau', 'Bayonne', 'La Rochelle', 'Niort', 'Vannes', 'Quimper', 'Lorient',
  'Colmar', 'Troyes', 'Chartres', 'Beauvais', 'Évreux', 'Arras', 'Douai', 'Béziers',
  'Narbonne', 'Albi', 'Rodez', 'Cahors', 'Auch'
]

/** Producing organisations, written as they appear in real French open-data catalogues. */
const ORGANISMES = [
  'la métropole', 'le département', 'la région', 'la communauté de communes',
  "l'agence de l'eau", "l'observatoire régional", 'le syndicat mixte', "l'établissement public",
  'la préfecture', 'le ministère de la transition écologique', "l'institut national de la statistique",
  "l'institut géographique national", "l'agence de la transition écologique", 'la direction régionale',
  'le centre hospitalier', "la chambre d'agriculture", "l'office du tourisme", 'le rectorat',
  "la caisse d'allocations familiales", 'le opérateur de transport', "le service d'incendie et de secours",
  "la société d'économie mixte", "l'agglomération", 'la mairie', 'le conseil municipal',
  "l'université", 'le laboratoire de recherche', "l'association locale", 'la fédération sportive',
  'la coopérative agricole'
]

/** Themes — the vocabulary a French open-data portal actually indexes. */
const THEMES = [
  'la mobilité douce', "l'assainissement collectif", "la qualité de l'air", 'la gestion des déchets',
  "l'habitat social", 'la précarité énergétique', "l'accessibilité des bâtiments",
  'la restauration scolaire', 'les espaces verts', 'le patrimoine bâti', "l'éclairage public",
  'la voirie communale', 'la biodiversité ordinaire', 'les zones humides', 'le réseau cyclable',
  'la fréquentation touristique', "l'emploi salarié", "la création d'entreprises",
  "la consommation d'énergie", 'les émissions de gaz à effet de serre', "l'aide alimentaire",
  'la médiation numérique', 'la sécurité routière', 'les équipements sportifs',
  'la lecture publique', 'la santé mentale', 'le tri sélectif', "l'agriculture biologique",
  'la rénovation thermique des logements', 'le stationnement payant'
]

const ANNEES = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']

/**
 * ~170 natural French sentences about open data, public administration and territorial
 * statistics. Slots: {commune} {organisme} {theme} {annee} {nombre}.
 */
export const SENTENCES: string[] = [
  'Les données de {theme} sont publiées chaque année par {organisme} de {commune}.',
  'Ce jeu de données recense les équipements publics ouverts aux habitants en {annee}.',
  'La liste des marchés publics attribués par {organisme} est mise à jour tous les trimestres.',
  'Les communes rurales du département connaissent une baisse continue de leur population depuis {annee}.',
  "Le fichier décrit l'ensemble des arrêts desservis par le réseau de transport de {commune}.",
  'Chaque ligne correspond à une observation réalisée sur le terrain par les agents assermentés.',
  'Les résultats présentés ici ont été calculés à partir des déclarations transmises par les entreprises.',
  'Nous publions ces informations afin que les citoyens puissent contrôler les dépenses publiques.',
  'Les valeurs manquantes ont été laissées vides plutôt que remplacées par une estimation.',
  "L'observatoire suit l'évolution du parc de logements sociaux sur l'ensemble du territoire.",
  'Une nouvelle version du référentiel sera diffusée au premier trimestre {annee}.',
  'Les adresses ont été géocodées automatiquement puis vérifiées manuellement par les services.',
  'Ce document accompagne la délibération adoptée par le conseil municipal de {commune}.',
  'Les subventions versées aux associations sportives figurent dans le tableau annexé.',
  'Les données concernant {theme} proviennent de plusieurs sources qui ont été harmonisées.',
  "Le taux de couverture atteint {nombre} pour cent des communes de l'agglomération.",
  "Les usagers peuvent signaler une anomalie directement depuis l'application mobile.",
  'Nous avons supprimé les colonnes qui contenaient des informations personnelles identifiantes.',
  'Le périmètre géographique retenu correspond aux limites administratives en vigueur en {annee}.',
  'Les indicateurs sont recalculés dès que les communes transmettent leurs déclarations annuelles.',
  'Cette étude analyse les déplacements domicile-travail des salariés résidant à {commune}.',
  'Les collectivités territoriales sont tenues de publier leurs budgets dans un format ouvert.',
  "L'agence a mesuré la qualité des eaux de baignade sur {nombre} points de prélèvement.",
  'Les documents administratifs communicables sont diffusés sans restriction de réutilisation.',
  'Un identifiant stable permet de rapprocher ce fichier avec les millésimes précédents.',
  'Les écoles publiques accueillent un nombre croissant élèves depuis la rentrée {annee}.',
  'Le service instruit les demandes de permis de construire déposées par les particuliers.',
  'Les parcelles cadastrales ont été rattachées à la commune dont elles dépendent.',
  'Les émissions mesurées diminuent lentement mais restent supérieures aux objectifs fixés.',
  'Ce tableau détaille les effectifs des agents employés par {organisme}.',
  'Les horaires théoriques diffèrent parfois des horaires réellement observés sur le réseau.',
  "L'enquête a été menée auprès d'un échantillon représentatif des ménages du département.",
  'Les montants sont exprimés en euros courants et ne sont pas corrigés de l\'inflation.',
  "Nous recommandons de croiser ces résultats avec les données produites par l'institut national de la statistique.",
  'La collecte des déchets ménagers est assurée par {organisme} depuis {annee}.',
  'Les zones classées protégées ne peuvent pas être urbanisées sans dérogation préfectorale.',
  'Les demandeurs emploi inscrits en fin de mois sont comptabilisés selon la définition officielle.',
  "L'accessibilité des bâtiments recevant du public fait l'objet d'un diagnostic régulier.",
  'Les chiffres publiés portent sur les douze derniers mois glissants.',
  'Cette ressource est mise à disposition sous licence ouverte permettant la réutilisation commerciale.',
  'Les bornes de recharge installées sur la voirie sont référencées avec leur puissance.',
  'Le nombre de logements vacants continue de progresser dans les centres anciens.',
  'Les partenaires du projet se réunissent deux fois par an pour valider les orientations.',
  'Nous publions également les scripts qui ont servi à produire ces agrégats.',
  'Les données brutes restent disponibles pour les utilisateurs qui souhaitent refaire les calculs.',
  "Les entreprises artisanales représentent une part importante de l'emploi local.",
  "L'exploitation agricole déclarée doit préciser les surfaces cultivées et les cheptels détenus.",
  'Les températures relevées durant la période estivale dépassent régulièrement les normales saisonnières.',
  'Les bibliothèques municipales ont enregistré {nombre} prêts au cours de l\'année {annee}.',
  "Le plan local d'urbanisme a été révisé pour intégrer les nouvelles orientations régionales.",
  'Les données personnelles ont été agrégées afin de garantir le secret statistique.',
  'Un contrôle qualité automatique rejette les lignes dont les coordonnées sont incohérentes.',
  'Les associations déclarées en préfecture doivent publier leurs comptes annuels.',
  "Les travaux de rénovation thermique sont financés conjointement par la région et l'État.",
  'Cette carte représente les secteurs desservis par le réseau de chaleur urbain.',
  "Les habitants interrogés jugent l'offre de transport insuffisante en périphérie.",
  'Le dispositif accompagne les ménages modestes qui rénovent leur logement.',
  "Les prélèvements effectués dans les cours d'eau révèlent une pollution diffuse d'origine agricole.",
  'Les communes littorales appliquent des règles spécifiques en matière de construction.',
  'Le budget primitif voté prévoit une hausse limitée des dépenses de fonctionnement.',
  "Les recettes fiscales perçues par la collectivité sont détaillées par catégorie d'impôt.",
  'Les subventions accordées sont conditionnées au respect des engagements pris par le bénéficiaire.',
  "Nous mettons à jour ce fichier chaque nuit à partir du système d'information métier.",
  'Les colonnes ont été renommées pour respecter le schéma national de description.',
  'Le référentiel des voies comprend {nombre} tronçons répartis sur le territoire communal.',
  'Les points d\'apport volontaire installés dans les quartiers facilitent le tri sélectif.',
  "Les gestionnaires de réseau signalent les interruptions de service dès qu'elles surviennent.",
  'Les élèves scolarisés dans les établissements privés ne sont pas comptés dans ce fichier.',
  "L'observatoire publie chaque semestre une note de conjoncture commentant les évolutions.",
  'Les surfaces artificialisées progressent moins vite que durant la décennie précédente.',
  'Les acteurs associatifs interviennent auprès des publics fragiles repérés par les services sociaux.',
  'Le calendrier prévisionnel des travaux est communiqué aux riverains avant le démarrage du chantier.',
  'Les conteneurs enterrés remplacent progressivement les bacs roulants dans le centre historique.',
  'Ce jeu de données décrit les installations classées pour la protection de l\'environnement.',
  'Les stations de mesure enregistrent les concentrations de particules fines toutes les heures.',
  'Les résultats sont provisoires et seront consolidés lorsque les remontées seront complètes.',
  'Les services instructeurs vérifient la conformité des dossiers avant de les transmettre.',
  'Les habitants peuvent consulter librement les documents budgétaires en mairie.',
  "Les pistes cyclables aménagées récemment relient les principaux pôles d'emploi.",
  'Le taux de participation aux dernières élections municipales a légèrement reculé.',
  'Les données géographiques sont diffusées dans le système de coordonnées national.',
  'Les licences sportives délivrées par les fédérations sont réparties par discipline.',
  "L'analyse montre que les inégalités territoriales persistent malgré les dispositifs mis en place.",
  'Les enseignants affectés dans ces établissements bénéficient d\'une indemnité spécifique.',
  "Chaque enregistrement porte la date à laquelle l'information a été constatée.",
  'Les commerces de proximité ferment plus fréquemment dans les communes isolées.',
  'Le programme de renouvellement urbain concerne {nombre} logements répartis sur trois quartiers.',
  'Les captages d\'eau potable font l\'objet de périmètres de protection réglementaires.',
  'Les usagers ayant souscrit un abonnement annuel représentent la majorité des validations.',
  'Les nuisances sonores mesurées à proximité des axes routiers dépassent les seuils réglementaires.',
  "Nous invitons les réutilisateurs à citer la source lorsqu'ils publient des analyses dérivées.",
  'Les documents anciens numérisés sont consultables depuis le portail patrimonial.',
  'Le nombre de naissances domiciliées diminue régulièrement depuis {annee}.',
  'Les entreprises créées sous le régime simplifié représentent la moitié des immatriculations.',
  "Les agents municipaux assurent l'entretien des espaces verts tout au long de l'année.",
  'Les tarifs appliqués varient selon le quotient familial calculé pour chaque foyer.',
  "Le schéma directeur définit les orientations d'aménagement pour les quinze prochaines années.",
  'Les places de stationnement réservées aux personnes handicapées sont localisées précisément.',
  'Les épisodes de sécheresse répétés fragilisent les cultures et les ressources en eau.',
  'Les données transmises par les opérateurs privés sont anonymisées avant publication.',
  'Ce fichier remplace la version diffusée précédemment qui comportait des doublons.',
  'Les décisions rendues par la commission sont publiées après un délai de deux mois.',
  'Les collectivités qui adhèrent au syndicat mutualisent leurs moyens techniques.',
  'Le taux de pauvreté observé dans certains quartiers reste très supérieur à la moyenne nationale.',
  'Les logements construits avant la première réglementation thermique consomment beaucoup plus.',
  'Les visiteurs accueillis dans les musées municipaux ont été plus nombreux cet été.',
  "L'exploitation des données de billettique permet de reconstituer les flux de voyageurs.",
  'Les paramètres physico-chimiques analysés figurent dans le dictionnaire des variables.',
  'Les habitants des quartiers prioritaires accèdent moins facilement aux soins spécialisés.',
  'Le nombre d\'interventions réalisées par les sapeurs-pompiers augmente chaque été.',
  'Les surfaces cultivées en agriculture biologique ont doublé au cours de la dernière décennie.',
  'Les demandes déposées en ligne sont traitées dans un délai moyen de trois semaines.',
  'Les équipements sportifs recensés appartiennent majoritairement aux communes.',
  'Les mesures compensatoires prévues par le maître d\'ouvrage seront suivies pendant dix ans.',
  'Les chiffres de fréquentation touristique reposent sur les nuitées déclarées par les hébergeurs.',
  'Les crèches municipales proposent un nombre de places insuffisant au regard de la demande.',
  "Le réseau de bus a été restructuré afin d'améliorer la desserte des zones périurbaines.",
  'Les propriétaires bailleurs bénéficient d\'aides lorsqu\'ils louent à un loyer modéré.',
  'Les données publiées ici respectent le schéma défini au niveau national.',
  'Les incidents signalés sont classés selon leur gravité et leur origine présumée.',
  'Les partenaires financiers contribuent à hauteur de {nombre} pour cent du coût total.',
  'Les jeunes diplômés quittent le département faute d\'offres d\'emploi qualifiées.',
  'Les zones inondables cartographiées couvrent une partie importante de la vallée.',
  'Les repas servis dans les cantines scolaires comportent une part croissante de produits locaux.',
  "Les documents joints précisent la méthodologie employée et les limites de l'exercice.",
  'Les habitants âgés de plus de soixante ans représentent une part croissante de la population.',
  "Les travaux engagés sur le réseau d'assainissement réduiront les rejets en milieu naturel.",
  'Les artisans installés dans la commune emploient en moyenne trois salariés.',
  'Le dispositif expérimenté à {commune} sera étendu aux communes voisines si les résultats sont concluants.',
  'Les autorisations délivrées portent principalement sur des extensions de maisons individuelles.',
  'Les relevés effectués par les bénévoles complètent utilement les observations des scientifiques.',
  'Les espèces protégées recensées sur le site nécessitent des précautions particulières.',
  'Le montant des aides versées aux ménages a progressé de {nombre} pour cent en un an.',
  'Les indicateurs de suivi seront publiés annuellement jusqu\'à la fin du programme.',
  'Les communes qui ont fusionné apparaissent sous leur nouveau code officiel géographique.',
  'Les rejets industriels déclarés sont contrôlés par les services de l\'État.',
  'Les places disponibles dans les établissements pour personnes âgées sont rares.',
  'Le taux d\'équipement des ménages en véhicules diminue dans les grandes agglomérations.',
  "Les données sont fournies telles quelles sans garantie d'exhaustivité ni d'exactitude.",
  'Les conventions signées avec les associations précisent les objectifs et les moyens alloués.',
  'Les parcours de formation proposés répondent aux besoins exprimés par les employeurs locaux.',
  'Les riverains consultés lors de la concertation ont majoritairement approuvé le projet.',
  "L'éclairage public est progressivement remplacé par des luminaires moins énergivores.",
  'Les élus locaux réclament davantage de moyens pour entretenir les routes départementales.',
  'Les surfaces commerciales autorisées ces dernières années se situent en périphérie.',
  'Les données historiques remontent jusqu\'à {annee} pour certaines communes seulement.',
  "Les usagers vulnérables sont surreprésentés parmi les victimes d'accidents de la route.",
  'Le service public de l\'eau dessert la totalité des foyers raccordés au réseau.',
  'Les analyses réalisées confirment que la ressource reste globalement de bonne qualité.',
  'Les projets financés doivent démarrer dans les douze mois suivant la notification.',
  'Les demandes de logement social déposées dépassent largement le nombre attributions annuelles.',
  'Les chiffres présentés diffèrent de ceux publiés antérieurement car la méthode a changé.',
  "Les manifestations culturelles organisées durant l'été attirent un public familial.",
  'Les capteurs déployés transmettent leurs mesures toutes les quinze minutes.',
  'Les agents recenseurs se déplacent au domicile des habitants tirés au sort.',
  'Les linéaires de haies préservées jouent un rôle important pour la biodiversité.',
  'Le patrimoine bâti communal comprend {nombre} édifices dont plusieurs sont protégés.',
  'Les habitants qui le souhaitent peuvent participer aux ateliers de concertation.',
  'Les données relatives à {theme} seront enrichies au fur et à mesure des remontées.',
  'Les véhicules électriques immatriculés progressent rapidement mais restent minoritaires.',
  'Les résultats détaillés par bureau de vote sont disponibles dans un fichier séparé.',
  'Les personnes hébergées dans les structures d\'urgence sont comptabilisées chaque nuit.',
  "Les commerçants installés sur les marchés hebdomadaires paient une redevance d'occupation.",
  'Les cours d\'eau du bassin versant sont suivis par un réseau de stations automatiques.',
  'Les investissements réalisés portent essentiellement sur les bâtiments scolaires.',
  'Les agents territoriaux titulaires représentent la majorité des effectifs employés.',
  'Le taux de remplissage des trains régionaux progresse depuis la baisse des tarifs.',
  'Les documents d\'urbanisme opposables sont consultables sur le géoportail national.',
  'Les chiffres de la collecte sélective montrent une amélioration lente mais régulière.',
  'Les listes électorales révisées comportent {nombre} inscrits dans la commune de {commune}.'
]

/** Numbers injected into `{nombre}` slots — plain digit tokens, as in real administrative prose. */
const NOMBRES = ['12', '38', '145', '260', '512', '1 340', '2 780', '4 219', '11 600', '38 421', '127 000']

function pick<T> (arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

/** Fill the {commune}/{organisme}/{theme}/{annee}/{nombre} slots of one sentence. */
export function fillSlots (sentence: string, rand: () => number): string {
  return sentence.replace(/\{(\w+)\}/g, (_, slot: string) => {
    switch (slot) {
      case 'commune': return pick(COMMUNES, rand)
      case 'organisme': return pick(ORGANISMES, rand)
      case 'theme': return pick(THEMES, rand)
      case 'annee': return pick(ANNEES, rand)
      case 'nombre': return pick(NOMBRES, rand)
      default: return slot
    }
  })
}

/**
 * Pick a sentence with a mild frequency skew (`rand()^1.6`) instead of uniformly: real corpora
 * are Zipfian, and a uniform pick would give every sentence — hence every term — the same
 * document frequency, which flatters block-max-WAND and hides posting-list size differences.
 */
function pickSentence (rand: () => number): string {
  return SENTENCES[Math.floor(Math.pow(rand(), 1.6) * SENTENCES.length)]
}

export interface TextDoc {
  id: string
  title: string
  description: string
}

/** Two text columns, prod-shaped: a ~1-sentence title and a ~4-sentence description. */
export const DESCRIPTION_SENTENCES = 4

/** Deterministically generate `count` docs (same docs for every mapping variant). */
export function * docIterator (count: number, seed = 42): Generator<TextDoc, void, unknown> {
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const title = fillSlots(pickSentence(rand), rand).replace(/\.$/, '')
    const sentences: string[] = []
    for (let s = 0; s < DESCRIPTION_SENTENCES; s++) sentences.push(fillSlots(pickSentence(rand), rand))
    yield { id: `rec-${i}`, title, description: sentences.join(' ') }
  }
}

/** Eager variant, for tests and corpus statistics. */
export function generateDocs (count: number, seed = 42): TextDoc[] {
  return [...docIterator(count, seed)]
}

/** French stopwords (the `_french_` list ES's `french_stop` uses) — for corpus statistics only. */
const FRENCH_STOPWORDS = new Set([
  'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'elle', 'en', 'et', 'eux', 'il',
  'je', 'la', 'le', 'leur', 'lui', 'ma', 'mais', 'me', 'même', 'mes', 'moi', 'mon', 'ne', 'nos',
  'notre', 'nous', 'on', 'ou', 'par', 'pas', 'pour', 'qu', 'que', 'qui', 'sa', 'se', 'ses', 'son',
  'sur', 'ta', 'te', 'tes', 'toi', 'ton', 'tu', 'un', 'une', 'vos', 'votre', 'vous', 'c', 'd',
  'j', 'l', 'à', 'm', 'n', 's', 't', 'y', 'été', 'étée', 'étées', 'étés', 'étant', 'suis', 'es',
  'est', 'sommes', 'êtes', 'sont', 'serai', 'seras', 'sera', 'serons', 'serez', 'seront', 'ai',
  'as', 'avons', 'avez', 'ont', 'aura', 'auront', 'avais', 'avait', 'étais', 'était', 'étaient'
])

export interface CorpusStats {
  docs: number
  sentences: number
  avgTitleWords: number
  avgDescriptionWords: number
  /** Share of whitespace-separated tokens that are French stopwords. */
  stopwordDensity: number
  /** Share of tokens longer than 3 chars that end with a plural/inflection-bearing suffix. */
  inflectedSuffixShare: number
  distinctWords: number
}

const WORD_RE = /[\p{L}\p{N}'’-]+/gu

// ---------------------------------------------------------------------------------------------
// Wide-fanout shape — reuses the same SENTENCES/fillSlots/pickSentence machinery above, but
// instead of a title + description pair spreads the corpus over N independently-generated text
// columns (the `wide-text` preset shape: ~40 text columns), 1-2 sentences each — see
// `text-analyzer-wide.ts` §14.b.
// ---------------------------------------------------------------------------------------------

export const WIDE_COLUMNS = 40

export interface WideTextDoc {
  id: string
  /** `col1`..`colN` values, in column order. */
  cols: string[]
}

/** Deterministically generate `count` wide docs (same docs for every mapping variant). */
export function * wideDocIterator (count: number, numCols = WIDE_COLUMNS, seed = 42): Generator<WideTextDoc, void, unknown> {
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const cols: string[] = []
    for (let c = 0; c < numCols; c++) {
      const nSentences = rand() < 0.5 ? 1 : 2
      const sentences: string[] = []
      for (let s = 0; s < nSentences; s++) sentences.push(fillSlots(pickSentence(rand), rand))
      cols.push(sentences.join(' '))
    }
    yield { id: `rec-${i}`, cols }
  }
}

/** Eager variant, for tests and corpus statistics. */
export function generateWideDocs (count: number, numCols = WIDE_COLUMNS, seed = 42): WideTextDoc[] {
  return [...wideDocIterator(count, numCols, seed)]
}

export interface WideCorpusStats {
  docs: number
  numCols: number
  avgWordsPerCol: number
  stopwordDensity: number
  inflectedSuffixShare: number
  distinctWords: number
}

/** Same local (non-ES) statistics as `corpusStats`, generalized to N columns. */
export function wideCorpusStats (docs: WideTextDoc[], numCols = WIDE_COLUMNS): WideCorpusStats {
  let colWords = 0
  let stopwords = 0
  let total = 0
  let inflected = 0
  let longTokens = 0
  const distinct = new Set<string>()
  for (const doc of docs) {
    for (const col of doc.cols) {
      const words = col.toLowerCase().match(WORD_RE) ?? []
      colWords += words.length
      for (const w of words) {
        total++
        distinct.add(w)
        if (FRENCH_STOPWORDS.has(w)) stopwords++
        if (w.length > 3) {
          longTokens++
          if (/(s|es|ent|ées|ée|és|é|aux|ive|ives|ment)$/.test(w)) inflected++
        }
      }
    }
  }
  return {
    docs: docs.length,
    numCols,
    avgWordsPerCol: docs.length === 0 ? 0 : colWords / (docs.length * numCols),
    stopwordDensity: total === 0 ? 0 : stopwords / total,
    inflectedSuffixShare: longTokens === 0 ? 0 : inflected / longTokens,
    distinctWords: distinct.size
  }
}

/**
 * Local (non-ES) corpus statistics — a cheap, dependency-free sanity report proving the text is
 * natural French. The authoritative token-level numbers (post-analysis stopword removal, share of
 * positions where `keyword_repeat` actually emits two tokens) are measured against ES in the
 * experiment itself.
 */
export function corpusStats (docs: TextDoc[]): CorpusStats {
  let titleWords = 0
  let descWords = 0
  let stopwords = 0
  let total = 0
  let inflected = 0
  let longTokens = 0
  const distinct = new Set<string>()
  for (const doc of docs) {
    const tWords = doc.title.toLowerCase().match(WORD_RE) ?? []
    const dWords = doc.description.toLowerCase().match(WORD_RE) ?? []
    titleWords += tWords.length
    descWords += dWords.length
    for (const w of [...tWords, ...dWords]) {
      total++
      distinct.add(w)
      if (FRENCH_STOPWORDS.has(w)) stopwords++
      if (w.length > 3) {
        longTokens++
        if (/(s|es|ent|ées|ée|és|é|aux|ive|ives|ment)$/.test(w)) inflected++
      }
    }
  }
  return {
    docs: docs.length,
    sentences: SENTENCES.length,
    avgTitleWords: titleWords / docs.length,
    avgDescriptionWords: descWords / docs.length,
    stopwordDensity: total === 0 ? 0 : stopwords / total,
    inflectedSuffixShare: longTokens === 0 ? 0 : inflected / longTokens,
    distinctWords: distinct.size
  }
}
