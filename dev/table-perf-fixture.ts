/**
 * Generator of the `fixtures-table-perf` dev dataset: wide (50 columns) and long
 * (10k rows by default) enough to stress the dataset table, with the column kinds
 * it renders differently. Seeded, so every environment gets identical data and
 * the UI performance harness (benchmark/src/ui) measures the same thing everywhere.
 */

export const TABLE_PERF_ID = 'fixtures-table-perf'
export const TABLE_PERF_SEARCH_WORD = 'Rennes'

export type ColumnKind = 'id' | 'short' | 'lowCard' | 'long' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'boolean' | 'url' | 'multi'

const col = (key: string, kind: ColumnKind) => ({ key, kind })

export const tablePerfColumns: { key: string, kind: ColumnKind }[] = [
  col('numero', 'id'),
  ...['nom', 'prenom', 'code', 'reference', 'adresse', 'responsable', 'service', 'site'].map(k => col(k, 'short')),
  ...['commune', 'categorie', 'statut', 'priorite', 'region'].map(k => col(k, 'lowCard')),
  ...['description', 'commentaire', 'observations', 'historique'].map(k => col(k, 'long')),
  ...['quantite', 'stock', 'annee', 'duree_jours', 'nb_agents', 'nb_visites', 'etage', 'capacite', 'score', 'rang'].map(k => col(k, 'integer')),
  ...['prix', 'montant', 'latitude_approx', 'longitude_approx', 'taux', 'surface', 'poids', 'consommation'].map(k => col(k, 'decimal')),
  ...['date_creation', 'date_maj', 'date_debut', 'date_fin'].map(k => col(k, 'date')),
  ...['horodatage', 'derniere_visite', 'prochaine_visite'].map(k => col(k, 'dateTime')),
  ...['actif', 'verifie', 'public'].map(k => col(k, 'boolean')),
  ...['site_web', 'document'].map(k => col(k, 'url')),
  ...['etiquettes', 'equipements'].map(k => col(k, 'multi'))
]

// mulberry32: tiny, fast, good enough for fixture data
const prng = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const communes = ['Rennes', 'Nantes', 'Brest', 'Lorient', 'Vannes', 'Quimper', 'Saint-Malo', 'Angers', 'Laval', 'Le Mans', 'Tours', 'Caen', 'Cherbourg', 'Saint-Brieuc', 'Lannion', 'Morlaix', 'Dinan', 'Fougères', 'Vitré', 'Redon']
const lowCard: Record<string, string[]> = {
  commune: communes,
  categorie: ['Mobilier', 'Informatique', 'Éclairage', 'Sécurité', 'Mobilité'],
  statut: ['Ouvert', 'En cours', 'Fermé'],
  priorite: ['Basse', 'Normale', 'Haute', 'Critique'],
  region: ['Bretagne', 'Pays de la Loire', 'Normandie', 'Centre-Val de Loire']
}
const words = ['analyse', 'réseau', 'énergie', 'production', 'maintenance', 'contrôle', 'équipement', 'intervention', 'mesure', 'capteur', 'installation', 'conformité', 'rapport', 'campagne', 'données', 'qualité', 'planning', 'secteur', 'raccordement', 'compteur']
const firstNames = ['Camille', 'Dominique', 'Alex', 'Sacha', 'Morgan', 'Claude', 'Charlie', 'Yann', 'Gwen', 'Maël']
const lastNames = ['Le Gall', 'Martin', 'Bernard', 'Le Roux', 'Morvan', 'Guillou', 'Thomas', 'Petit', 'Robert', 'Richard']
const tags = ['wifi', 'parking', 'accessible', 'chauffage', 'climatisation', 'ascenseur', 'vidéo', 'badge']

const csvCell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function generateTablePerfCsv (rows: number, seed = 42): string {
  const rand = prng(seed)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const sentence = (minChars: number) => {
    let s = ''
    // the search word appears in a minority of long texts, never most of them
    if (rand() < 0.05) s = `Site de ${TABLE_PERF_SEARCH_WORD}. `
    while (s.trim().length < minChars) s += pick(words) + (rand() < 0.15 ? '. ' : ' ')
    return s.trim()
  }
  const date = () => `${int(2015, 2026)}-${pad(int(1, 12))}-${pad(int(1, 28))}`
  const dateTime = () => `${date()}T${pad(int(0, 23))}:${pad(int(0, 59))}:${pad(int(0, 59))}+0${int(1, 2)}:00`

  const value = (key: string, kind: ColumnKind, i: number): string => {
    switch (kind) {
      case 'id': return String(i + 1)
      case 'short':
        if (key === 'nom') return pick(lastNames)
        if (key === 'prenom') return pick(firstNames)
        if (key === 'code') return `${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}-${int(1000, 9999)}`
        if (key === 'adresse') return `${int(1, 200)} rue ${pick(lastNames)}`
        return `${pick(words)} ${int(1, 99)}`
      case 'lowCard':
        // commune is skewed away from the search word so a search narrows the results
        if (key === 'commune') return rand() < 0.03 ? TABLE_PERF_SEARCH_WORD : pick(communes.slice(1))
        return pick(lowCard[key])
      case 'long': return sentence(key === 'description' ? 300 : int(200, 600))
      case 'integer': return String(int(0, 100000))
      case 'decimal': return (rand() * 10000).toFixed(int(1, 4))
      case 'date': return date()
      case 'dateTime': return dateTime()
      case 'boolean': return rand() < 0.5 ? 'true' : 'false'
      case 'url': return `https://example.com/${key}/${i + 1}`
      case 'multi': return Array.from({ length: int(1, 4) }, () => pick(tags)).join(';')
    }
  }

  const out = [tablePerfColumns.map(c => c.key).join(',')]
  for (let i = 0; i < rows; i++) {
    out.push(tablePerfColumns.map(c => csvCell(value(c.key, c.kind, i))).join(','))
  }
  return out.join('\n') + '\n'
}

export function tablePerfUploadBody () {
  return {
    title: 'Tableau — performance',
    description: 'Jeu de données large (50 colonnes) et long (10 000 lignes) pour vérifier les performances du tableau. ' +
      'Utilisé par `npm run benchmark -- ui-table` (voir benchmark/README.md).',
    schema: tablePerfColumns.filter(c => c.kind === 'multi').map(c => ({ key: c.key, separator: ';' }))
  }
}
