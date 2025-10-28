// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../datasets/es/commons.js'
}}

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/Opendatasoft-Query-Language-(ODSQL)/Select-clause
// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-aggregate-functions

start
  = Select

Select
  = before:SelectExpression
    after:(_ "," _ SelectExpression)* {
      const parts = [before, ...after.map(a => a[3])]
      const sources = []
      const aliases = {}
      const aggregations = {}
      const transforms = {}
      const finalKeys = []
      for (const part of parts) {
        if (part.source) {
          finalKeys.push(part.alias ?? part.source)
          if (!sources.includes(part.source)) {
            sources.push(part.source)
          }
          if (part.alias) {
            aliases[part.source] = aliases[part.source] ?? []
            aliases[part.source].push({name: part.alias})
          }
          if (part.transform) {
            transforms[part.alias ?? part.source] = part.transform
          }
        }
        if (part.aggregation) {
          const aggName = Object.keys(part.aggregation)[0]
          finalKeys.push(part.alias ?? aggName)
          Object.assign(aggregations, part.aggregation)
          if (part.alias) {
            aliases[aggName] = aliases[aggName] ?? []
            aliases[aggName].push({name: part.alias})
          }
        }
      }
      return { sources, aliases, aggregations, finalKeys }
   }

SelectExpression
  = SelectAggregationAlias
  / SelectAggregation
  / SelectFieldNameAlias
  / SelectFieldName

SelectFieldName
  = key:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { source: key }
  }

As = "as"i

SelectFieldNameAlias
  = key:FieldName __ As __ alias:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { source: key, alias }
  }

SelectAggregation
  = SelectAvg
  / SelectCountAll
  / SelectCountField
  / SelectCountDistinct
  / SelectBBox
  / SelectMax
  / SelectMin
  / SelectSum
  / SelectPercentile
  / SelectMedian

SelectAggregationAlias
  = aggregation:SelectAggregation __ As __ alias:FieldName {
    return { ...aggregation, alias }
  }

SelectAvg
  = "avg("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de calculer la moyenne du champ ${key}, il n'est pas de type numérique.`)
    return { aggregation: { [text()]: { avg: {field: key} } } }
  }

SelectCountAll
  = "count(*)"i {
    // return options.grouped ? { source: 'doc_count', alias } : { source: '___total_hits', alias }
    return { aggregation: { [text()]: { value_count: {field: '_id'} } } }
  }

SelectCountField
  = "count("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { aggregation: { [text()]: { value_count: {field: key} } } }
  }

SelectCountDistinct
  = "count(distinct"i __ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { aggregation: { [text()]: { cardinality: {field: key} } } }
  }

SelectBBox
  = "bbox("i _ key:FieldName _ ")" {
    if (!options.dataset.bbox) throw httpError(400, '"bbox" function cannot be used on this dataset. It is not geolocalized.')
    const geoCornersProp = dataset.schema.find(p => p.key === '_geocorners')
    const geoCorners = geoCornersProp && (!geoCornersProp['x-capabilities'] || geoCornersProp['x-capabilities'].geoCorners !== false)
    return { aggregation: { [text()]: { geo_bounds: {field: geoCorners ? '_geocorners' : '_geopoint'} } } }
  }

SelectMax
  = "max("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { aggregation: { [text()]: { max: {field: key} } } }
  }

SelectMin
  = "min("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { aggregation: { [text()]: { min: {field: key} } } }
  }

SelectSum
  = "sum("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de calculer la somme du champ ${key}, il n'est pas de type numérique.`)
    return { aggregation: { [text()]: { sum: {field: key} } } }
  }

SelectPercentile
  = "percentile("i _ key:FieldName _ "," _ percent:NumericLiteral _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de calculer les percentiles du champ ${key}, il n'est pas de type numérique.`)
    return { aggregation: { [text()]: { percentiles: {field: key, percents: [percent], keyed: false} } } }
  }

SelectMedian
  = "median("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de calculer la médiane du champ ${key}, il n'est pas de type numérique.`)
    return { aggregation: { [text()]: { percentiles: {field: key, percents: [50], keyed: false} } } }
  }

SelectYear
  = "year("i _ key:FieldName _ ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'string' || (prop.format !== 'date' || prop.format !== 'date-time')) throw httpError(400, `Impossible de calculer l'année du champ ${key}, il n'est pas de type date.`)
    return { source: key, alias, transform: 'year' }
  }