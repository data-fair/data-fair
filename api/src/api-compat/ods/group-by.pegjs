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

// requête en erreur
// https://data.enedis.fr/api/explore/v2.1/catalog/datasets/donnees-de-temperature-et-de-pseudo-rayonnement/exports/csv?group_by=horodate&select=avg(temperature_realisee_lissee_degc)%20as%20av,count(*)&order_by=av%20desc
// "ODSQL query is malformed: aggregation function in order by is not supported with a limit > 20000. Please remove the order by or set a limit parameter lower than 20001. Clause(s) containing the error(s): order_by."

start
  = GroupBy

GroupBy
  = before:GroupByExpression
    after:(_ "," _ GroupByExpression)* {
      const groupByExpressions = [before, ...after.map(a => a[3])]
      const aliases = options.aliases ?? {}
      const transforms = options.transforms ?? {}
      
      // range aggs are not compatible with composite, in this case it seems that odsql uses some imperfect merging strategy
      // https://data.enedis.fr/api/explore/v2.1/catalog/datasets/donnees-de-temperature-et-de-pseudo-rayonnement/records?group_by=horodate,range(pseudo_rayonnement,%20*,20,25,30,35,40,45,%20*)
      
      const useComposite = !groupByExpressions.some(e => e.noComposite)
      if (!useComposite) {
        const aggs = {}

        /* attempt at a nested strategy, but it doesn't exactly match odsql 

        let previousAggLevel = aggs
        groupByExpressions.sort((e1, e2) => {
          if (e1.noComposite && !e2.noComposite) return -1
          if (e2.noComposite && !e1.noComposite) return 1
        })
        for (const groupByExpression of groupByExpressions) {
          Object.assign(previousAggLevel, groupByExpression.source)
          const aggName = Object.keys(previousAggLevel)[0]
          if (!groupByExpression.noComposite) {
            previousAggLevel[aggName].size = 10
          }
          previousAggLevel[aggName].aggs = {}
          previousAggLevel = previousAggLevel[aggName].aggs
        }
        Object.assign(previousAggLevel, options.aggs)
        return {
          aliases: groupByExpressions.map(e => e.alias),
          aggs
        }*/
       if (groupByExpressions.length > 1) throw httpError(400, 'group_by with ranges cannot be combined with other merges')
       const source = groupByExpressions[0].source
       const aggName = Object.keys(source)[0]
       aliases.key = [groupByExpressions[0].alias]
       return {
          aliases: groupByExpressions.map(e => e.alias),
          composite: false,
          agg: {
            ...source[aggName],
            aggs: options.aggs
          }
        }
      }
      
      for (const e of groupByExpressions) {
        const aggName = Object.keys(e.source)[0]
        aliases[aggName] = aliases[aggName] ?? []
        aliases[aggName].push(e.alias)
        if (e.transform) transforms[e.alias?.name ?? aggName] = e.transform
      }
      return {
        aliases: groupByExpressions.map(e => e.alias),
        transforms,
        composite: true,
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
  = GroupByDateInterval
  / GroupByYear
  / GroupByNumberInterval
  / GroupByDateRanges
  / GroupByNumberRanges
  / GroupByField

GroupByField
  = field:FieldName {
    assertGroupable(field, options.dataset)
    const sortItem = options.sort.find(s => !!s[field])
    const order = sortItem ? sortItem[field] : 'asc'
    return {
      alias: { name: text() },
      source: {
        [text()]: {
          terms: {
            order,
            field
          }
        }
      }
    }
  }

GroupByNumberInterval
  = "range("i _ field:FieldName _ "," _ interval:NumericLiteral ")" {
      assertGroupable(field, options.dataset)
      return {
        alias: { name: text(), numberInterval: interval.value },
        source: {
          [text()]: {
            histogram: {
              field,
              interval: interval.value
            }
          }
        }
      }
    }

NumberRangePart
  = value:NumericLiteral { return value.value }
  / "*" { return "*" }

GroupByNumberRanges
  = "range("i _ field:FieldName rangeParts:(_ "," _ NumberRangePart)* _ ")" {
    assertGroupable(field, options.dataset)
    const parts = rangeParts.map(p => p[3])
    const ranges = []
    // https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-range-aggregation
    for (let i = 0; i < parts.length - 1; i++) {
      const range = {}
      if (parts[i] !== '*') range.from = parts[i]
      if (parts[i+1] !== '*') range.to = parts[i+1]
      ranges.push(range)
    }
    return {
      alias: { name: text(), numberRanges: true },
      noComposite: true,
      source: {
        [text()]: {
          range: {
            field,
            ranges
          }
        }
      }
    }
  }

DateUnit
  = "milliseconds" { return 'ms'}
  / "millisecond" { return 'ms'}
  / "ms" { return 'ms'}
  / "seconds" { return 's'}
  / "second" { return 's'}
  / "s" { return 's'}
  / "minutes" { return 'm'}
  / "minute" { return 'm'}
  / "m" { return 'm'}
  / "hours" { return 'h'}
  / "hour" { return 'h'}  
  / "h" { return 'h'}
  / "days" { return 'd'}
  / "day" { return 'd'}  
  / "d" { return 'd'}
  / "weeks" { return 'w'}
  / "week" { return 'w'}
  / "w" { return 'w'}
  / "months" { return 'M'}
  / "month" { return 'M'}
  / "M" { return 'M'}
  / "quarters" { return 'q'}
  / "quarter" { return 'q'}
  / "q" { return 'q'}
  / "years" { return 'y'}
  / "year" { return 'y'}
  / "y" { return 'y'}

DateInterval
  = value:NumericLiteral _ unit:DateUnit {
    if (value.value > 1) throw httpError(400, 'grouping by multiples of calendard units is not supported ')
    return { value: value.value, unit }
  }

GroupByDateInterval
  = "range("i _ field:FieldName _ "," _ interval:DateInterval _ ")" {
    assertGroupable(field, options.dataset)
    // https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-datehistogram-aggregation
    return {
      alias: { name: text(), dateInterval: interval },
      source: {
        [text()]: {
          date_histogram: {
            field,
            time_zone: options.timezone,
            calendar_interval: '' + interval.value + interval.unit
          }
        }
      }
    }
  }

GroupByYear
  = "year("i _ field:FieldName _ ")" {
    assertGroupable(field, options.dataset)
    // grouping by other parts of the date (month, etc) separately (not as a continuous date histogram)
    // would require indexing subfields
    return {
      alias: { name: text() },
      transform: { type: 'date_part', param: 'year' },
      source: {
        [text()]: {
          date_histogram: {
            field,
            time_zone: options.timezone,
            calendar_interval: '1y'
          }
        }
      }
    }
  }

DateRangePart
  = value:DateLiteral { return value.value }
  / "*" { return "*" }

GroupByDateRanges
  = "range("i _ field:FieldName rangeParts:(_ "," _ DateRangePart)* _ ")" {
    assertGroupable(field, options.dataset)
    const parts = rangeParts.map(p => p[3])
    const ranges = []
    // https://www.elastic.co/docs/reference/aggregations/search-aggregations-bucket-range-aggregation
    for (let i = 0; i < parts.length - 1; i++) {
      const range = {}
      if (parts[i] !== '*') range.from = parts[i]
      if (parts[i+1] !== '*') range.to = parts[i+1]
      ranges.push(range)
    }
    return {
      alias: { name: text(), dateRanges: true },
      noComposite: true,
      source: {
        [text()]: {
          date_range: {
            field,
            time_zone: options.timezone,
            ranges
          }
        }
      }
    }
  }