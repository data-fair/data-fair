// Deterministic data generation for benchmark datasets

// Simple seeded PRNG (mulberry32)
function mulberry32 (seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const WORDS = [
  'données', 'analyse', 'résultat', 'population', 'commune',
  'département', 'région', 'emploi', 'transport', 'énergie',
  'budget', 'école', 'santé', 'environnement', 'agriculture',
  'industrie', 'commerce', 'tourisme', 'culture', 'logement'
]

const CATEGORIES = [
  'cat-alpha', 'cat-beta', 'cat-gamma', 'cat-delta', 'cat-epsilon',
  'cat-zeta', 'cat-eta', 'cat-theta', 'cat-iota', 'cat-kappa'
]

export const benchSchema = [
  { key: 'str1', type: 'string' },
  { key: 'str2', type: 'string' },
  { key: 'num1', type: 'integer' },
  { key: 'num2', type: 'number' },
  { key: 'date1', type: 'string', format: 'date' },
  { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
  { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
]

export function generateRows (count: number, seed = 42) {
  const rand = mulberry32(seed)
  const rows = []

  for (let i = 0; i < count; i++) {
    // Generate a sentence of 3-6 words for full-text search
    const wordCount = 3 + Math.floor(rand() * 4)
    const words = []
    for (let w = 0; w < wordCount; w++) {
      words.push(WORDS[Math.floor(rand() * WORDS.length)])
    }

    // France bounding box approx: lat 41-51, lon -5 to 10
    rows.push({
      _id: `row-${i}`,
      str1: words.join(' '),
      str2: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
      num1: Math.floor(rand() * 1000),
      num2: Math.round(rand() * 10000) / 100,
      date1: `${2020 + Math.floor(rand() * 5)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      lat: 41 + rand() * 10,
      lon: -5 + rand() * 15
    })
  }

  return rows
}
