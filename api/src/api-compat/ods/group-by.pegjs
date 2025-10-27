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

// WARNING pretty ugly pagination and sorting logic for aggregations
// this approach was attempted but didn't work:
// https://github.com/elastic/elasticsearch/issues/33880

// re-creating the group_by functionality of ods is weird
// it combines un-paginated full exports which I think require search_after and therefore a composite
// but it also allows for any sort which is not compatible with a composite agg
// I think they use composite, fetch 20000 items and sort in memory
// meaning the sort parameter is not correctly applied above 20000 groups
// this seems consistent with these examples that fetch the same data either grouped
// or not with more then 20000 groups, and the grouped results have inconsistent sorting
// https://data.enedis.fr/api/explore/v2.1/catalog/datasets/donnees-de-temperature-et-de-pseudo-rayonnement/records?limit=20&group_by=horodate&select=avg(temperature_realisee_lissee_degc)%20as%20av,count(*)&order_by=av%20desc
// https://data.enedis.fr/api/explore/v2.1/catalog/datasets/donnees-de-temperature-et-de-pseudo-rayonnement/records?limit=20&select=horodate,temperature_realisee_lissee_degc&order_by=temperature_realisee_lissee_degc%20desc

start
  = GroupBy

GroupBy
  = before:GroupByExpression
    after:(_ "," _ GroupByExpression)* {
      const groupByExpressions = [before, ...after.map(a => a[3])]
      const aliases = options.aliases ?? {}
      
      for (const e of groupByExpressions) {
        const aggName = Object.keys(e.source)[0]
        aliases[aggName] = aliases[aggName] ?? []
        aliases[aggName].push(e.alias)
      }
      return {
        aliases: groupByExpressions.map(e => e.alias),
        agg: {
          composite: {
            size: 20000,
            sources: groupByExpressions.map(e => e.source)
          },
          aggs: options.aggs
        }
      }      
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
      source: {
        [text()]: {
          terms: {
            field
          }
        }
      }
    }
  }

GroupByNumberInterval
  = "range("i _ key:FieldName _ "," _ interval:NumericLiteral ")" {
      assertGroupable(key, options.dataset)
      return {
        alias: { name: text(), numberInterval: interval.value },
        source: {
          [text()]: {
            histogram: {
              field: key,
              interval: interval.value
            }
          }
        }
      }
    }
