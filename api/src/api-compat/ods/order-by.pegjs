// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../datasets/es/commons.js'
}}

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/Opendatasoft-Query-Language-(ODSQL)/Order-by-clause
// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-aggregate-functions

start
  = OrderBy

OrderBy
  = before:OrderByExpression
    after:(_ "," _ OrderByExpression)* {
      const parts = [before, ...after.map(a => a[3])]
      const sort = []
      const aggregations = {}
      for (const part of parts) {
        sort.push({ [part.key]: {order: part.direction ?? 'asc'} })
        if (part.aggregation) {
          aggregations[part.key] = part.aggregation
        }
      }
      return { sort, aggregations }
   }

OrderByExpression
  = OrderByExpressionWithDirection
  / OrderByExpressionWithoutDirection

Direction
  = "asc"i { return "asc" }
  / "desc"i { return "desc" }

OrderByExpressionWithDirection
  = orderBy:OrderByExpressionWithoutDirection __ direction:Direction {
    return { ...orderBy, direction }
  }

OrderByExpressionWithoutDirection
  = OrderByAvg
  / OrderByRandom
  / OrderByFieldName

OrderByFieldName
  = key:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop && !options.selectAggs?.[key]) throw httpError(400, `Impossible de trier sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { key }
  }

OrderByRandom
  = "random("i _ seed:NumericLiteral _ ")" {
    // we ignore the seed that would require using a function_score ES query and replace it
    // with pre-indexed _rand column (much faster)
    return { key: '_rand' }
  }

OrderByAvg
  = "avg("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de trier sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de trier sur la moyenne du champ ${key}, il n'est pas de type numérique.`)
    const aggName = '___order_by_avg_' + key
    return { key: aggName, aggregation: { avg: {field: key} } }
  }