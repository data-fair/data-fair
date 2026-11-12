// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { requiredCapability } from '../../datasets/es/operations.ts'
import { unknownFieldError, missingCapabilityError } from '../../datasets/utils/field-errors.ts'
import { notNumericError } from './errors.ts'
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
        const order = part.direction ?? 'asc'
        if (part.insensitive && !options.grouped) {
          sort.push({ [part.key + '.keyword_insensitive']: order })  
        } else {
          sort.push({ [part.key]: order })
        }
        if (part.aggregation) {
          aggregations[part.key] = part.aggregation
        }
      }
      return { sort, aggregations }
   }

OrderByExpression
  = OrderByExpressionWithDirection
  / OrderByExpressionWithMinus
  / OrderByExpressionWithoutDirection

Direction
  = "asc"i { return "asc" }
  / "desc"i { return "desc" }

OrderByExpressionWithDirection
  = orderBy:OrderByExpressionWithoutDirection __ direction:Direction {
    return { ...orderBy, direction }
  }

OrderByExpressionWithMinus
  = "-" orderBy:OrderByExpressionWithoutDirection {
    return { ...orderBy, direction: 'desc' }
  }

OrderByExpressionWithoutDirection
  = OrderByAvg
  / OrderByMax
  / OrderByMin
  / OrderBySum
  / OrderByPercentile
  / OrderByMedian
  / OrderByRandom
  / OrderByCountAll
  / OrderByCountField
  / OrderByCountDistinct
  / OrderByFieldName

OrderByFieldName
  = key:FieldName {
    const aliasOf = options.simpleAliases[key]
    const propKey = aliasOf ?? key
    const prop = options.dataset.schema.find(p => p.key === propKey)
    if (!prop && !aliasOf) {
      throw unknownFieldError('sort', key)
    }
    if (prop) {
      const capabilities = prop['x-capabilities'] || {}
      if (capabilities.values === false && capabilities.insensitive === false) {
        throw missingCapabilityError('sort', prop.key, 'values')
      }
      if (capabilities.insensitive !== false && prop.type === 'string' && (prop.format === 'uri-reference' || !prop.format)) {
        return { key: prop.key, insensitive: true }
      }
    }
    return { key: propKey }
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
    if (!prop) throw unknownFieldError('sort', key)
    if (prop.type !== 'number' && prop.type !== 'integer') throw notNumericError('sort', 'avg', key)
    const aggName = '___order_by_avg_' + key
    return { key: aggName, aggregation: { avg: {field: key} } }
  }

OrderByMax
  = "max("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    const aggName = '___order_by_max_' + key
    return { key: aggName, aggregation: { max: {field: key} } }
  }

OrderByMin
  = "min("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    const aggName = '___order_by_min_' + key
    return { key: aggName, aggregation: { min: {field: key} } }
  }

OrderBySum
  = "sum("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    if (prop.type !== 'number' && prop.type !== 'integer') throw notNumericError('sort', 'sum', key)
    const aggName = '___order_by_sum_' + key
    return { key: aggName, aggregation: { sum: {field: key} } }
  }

OrderByMedian
  = "median("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    if (prop.type !== 'number' && prop.type !== 'integer') throw notNumericError('sort', 'median', key)
    const aggName = '___order_by_median_' + key
    return { key: aggName, aggregation: { percentiles: {field: key, percents: [50], keyed: false} } }
  }

OrderByPercentile
  = "percentile("i _ key:FieldName _ "," _ percent:NumericLiteral _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    if (prop.type !== 'number' && prop.type !== 'integer') throw notNumericError('sort', 'percentile', key)
    const aggName = '___order_by_percentile_' + key
    return { key: aggName, aggregation: { percentiles: {field: key, percents: [percent], keyed: false} } }
  }

OrderByCountAll
  = "count(*)"i {
    return { key: '_count' }
  }

OrderByCountField
  = "count("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    const aggName = '___order_by_count_' + key
    return { key: aggName, aggregation: { value_count: {field: key} } }
  }

OrderByCountDistinct
  = "count(distinct"i __ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw unknownFieldError('sort', key)
    const aggName = '___order_by_cardinality_' + key
    return { key: aggName, aggregation: { cardinality: {field: key} } }
  }