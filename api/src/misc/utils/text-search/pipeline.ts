import type { ResolvedDefinition } from './definition.ts'
import type { QueryPlan, PhraseTerm } from './query.ts'
import { fieldKey } from './definition.ts'

/**
 * Every field this util stores on a document. All of them must be excluded from API responses:
 * `findUtils.project` builds an EXCLUSION projection when `select` is absent, so anything not
 * named here is returned — which would ship kilobytes of position arrays and leak corpus stats.
 */
export const INDEX_FIELD_NAMES = ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex'] as const

/**
 * What API responses must exclude: the stored index fields, plus the `_score` that the relevance
 * pipeline computes with `$addFields` before `$sort`. `_score` is not stored, but it leaks the same
 * way — `$project` runs after `$addFields`, so an exclusion projection that does not name it ships a
 * raw BM25 float on every relevance-sorted row.
 */
export const RESPONSE_EXCLUDED_FIELD_NAMES = [...INDEX_FIELD_NAMES, '_score'] as const

const K1 = 1.2
const B = 0.75

/**
 * A phrase matches when its terms sit at the query's own relative offsets WITHIN ONE FIELD.
 * Per field, shift each term's position array by its offset and intersect; a non-empty
 * intersection for any field means the phrase is present.
 */
const phraseExpression = (phrase: PhraseTerm[], fields: string[]): any => ({
  $gt: [{
    $size: {
      $reduce: {
        input: fields.map(field => ({
          $reduce: {
            input: phrase.map(({ term, delta }) => ({
              $map: {
                input: { $ifNull: [`$_pos.${fieldKey(field)}.${term}`, []] },
                in: { $subtract: ['$$this', delta] }
              }
            })),
            initialValue: null,
            in: { $cond: [{ $eq: ['$$value', null] }, '$$this', { $setIntersection: ['$$value', '$$this'] }] }
          }
        })),
        initialValue: [],
        in: { $concatArrays: ['$$value', { $ifNull: ['$$this', []] }] }
      }
    }
  }, 0]
})

export const matchFilter = (plan: QueryPlan, def: ResolvedDefinition): any => {
  const terms: any = { $in: plan.gate }
  if (plan.negated.length) terms.$nin = plan.negated
  const filter: any = { _terms: terms }
  if (plan.phrases.length) {
    const fields = Object.keys(def.fields)
    const exprs = plan.phrases.map(p => phraseExpression(p, fields))
    // $expr is a normal query operator, so this filter still works with find() and
    // countDocuments() — no separate aggregation is needed to count phrase queries.
    filter.$expr = exprs.length === 1 ? exprs[0] : { $and: exprs }
  }
  return filter
}

export const scoreExpression = (plan: QueryPlan, def: ResolvedDefinition): any => {
  const fieldScores = Object.entries(def.fields).map(([field, weight]) => ({
    $multiply: [weight, {
      $add: plan.terms.map(term => ({
        $let: {
          vars: {
            // term frequency is the number of recorded positions
            tf: { $size: { $ifNull: [`$_pos.${fieldKey(field)}.${term}`, []] } },
            l: { $ifNull: [`$_len.${fieldKey(field)}`, 0] }
          },
          in: {
            $cond: [{ $eq: ['$$tf', 0] }, 0, {
              $multiply: [plan.idf[term], {
                $divide: [
                  { $multiply: ['$$tf', K1 + 1] },
                  { $add: ['$$tf', { $multiply: [K1, { $add: [1 - B, { $multiply: [B / (plan.stats.avgLen[field] || 1), '$$l'] }] }] }] }
                ]
              }]
            }]
          }
        }
      }))
    }]
  }))
  // dis_max: the best field wins, the rest contribute tieBreaker x their sum. Summing instead
  // costs 7 hit@1 — it rewards a document for matching one term in many fields, so long
  // descriptions drown out a precise title.
  return {
    $let: {
      vars: { fs: fieldScores },
      in: { $add: [{ $max: '$$fs' }, { $multiply: [def.tieBreaker, { $subtract: [{ $sum: '$$fs' }, { $max: '$$fs' }] }] }] }
    }
  }
}

/** Never sort on _score alone: exact ties are common and mongo leaves them in an undefined order. */
export const sortSpec = (def: ResolvedDefinition): Record<string, number> =>
  ({ _score: -1, [def.tieBreakField]: 1 })
