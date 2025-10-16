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
      for (const part of parts) {
        if (part.source) {
          if (!sources.includes(part.source)) {
            sources.push(part.source)
          }
          if (part.alias) {
            aliases[part.source] = aliases[part.source] ?? []
            aliases[part.source].push(part.alias)
          }
        }
        if (part.aggregation) {
          Object.assign(aggregations, part.aggregation)
        }
      }
      return { sources, aliases, aggregations }
   }

SelectExpression
  = SelectAggregation
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

SelectAvg
  = "avg("i _ key:FieldName _ ")" __ As __ name:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type !== 'number' && prop.type !== 'integer') throw httpError(400, `Impossible de calculer la moyenne du champ ${key}, il n'est pas de type numérique.`)
    return { aggregation: { [name]: { avg: {field: key} } } }
  }

SelectCountAll
  = "count(*)"i __ As __ name:FieldName {
    // return options.grouped ? { source: 'doc_count', alias } : { source: '___total_hits', alias }
    return { aggregation: { [name]: { value_count: {field: '_id'} } } }
  }

SelectCountField
  = "count("i _ key:FieldName _ ")" __ As __ name:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible de sélectionner le champ ${key}, il n'existe pas dans le jeu de données.`)
    return { aggregation: { [name]: { value_count: {field: key} } } }
  }