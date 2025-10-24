// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../datasets/es/commons.js'
import capabilities from '../../../contract/capabilities.js'

const assertGroupable = (groupByKey, dataset) => {
  const prop = dataset.schema.find(p => p.key === groupByKey)
  if (!prop) {
    throw httpError(400, `Impossible de grouper par le champ ${groupByKey}, il n'existe pas dans le jeu de données.`)
  }
  if (prop['x-capabilities'] && prop['x-capabilities'].values === false) {
    throw httpError(400, `Impossible de grouper sur le champ ${groupByKey}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
  }
}
}}

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/Opendatasoft-Query-Language-(ODSQL)/Group-by-clause
// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-grouping-functions

start
  = GroupBy

GroupBy
  = before:GroupByExpression
    after:(_ "," _ GroupByExpression)* {
      const groupByExpressions = [before, ...after.map(a => a[3])]
      const aliases = []
      const aggs = {}
      let previousAggLevel = aggs
      for (const groupByExpression of groupByExpressions) {
        aliases.push(groupByExpression.alias)
        previousAggLevel.___group_by = groupByExpression.agg
        previousAggLevel.___group_by.aggs = { ...options.aggs }
        previousAggLevel = previousAggLevel.___group_by.aggs
      }
      return { aliases, aggs }
   }

As = "as"i

GroupByExpression
  = groupByItem:GroupByItem __ As __ alias:FieldName { return { ...groupByItem, alias: { ...groupByItem.alias, name: alias } } }
  / groupByItem:GroupByItem { return groupByItem }

GroupByItem
  = GroupByNumberInterval
  / GroupByField

GroupByField
  = field:FieldName {
    assertGroupable(field, options.dataset)
    return {
      alias: { name: text() },
      agg: {
        terms: {
          field,
          order: options.sort?.length ? options.sort : undefined,
          size: 20000
        },
        aggs: options.aggs
      }
    }
  }

GroupByNumberInterval
  = "range("i _ key:FieldName _ "," _ interval:NumericLiteral ")" {
      assertGroupable(key, options.dataset)
      return {
        alias: { name: text(), numberInterval: interval.value },
        agg: {
          histogram: {
            field: key,
            interval: interval.value,
            order: options.sort?.length ? options.sort : undefined,
          },
          aggs: options.aggs
        }
      }
    }
