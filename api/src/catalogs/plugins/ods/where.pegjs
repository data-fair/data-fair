// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../../datasets/es/commons.js'

const esOperators = {
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte'
}
}}

start
  = Filter

Filter
  = OrFilter

PrimaryFilter
  = StringFilter
  / EqualityFilter
  / InLiteralsFilter
  / InRangeFilter
  / InMultiValued
  / ComparisonFilter
  / NotFilter
  / "(" _ filter:Filter _ ")" { return filter }

EqualityFilter
  = key:FieldName _ EqualOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { term: { [key]: value.value } }
  }

EqualOperator
  = ":"
  / "="

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/IN-filter
InLiteralsFilter
  = key:FieldName __ In _ "(" values:LiteralsList ")" {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { terms: {[key]: values }}
  }

In = "in"i

LiteralsList
  = head:Literal tail:(LiteralAfterListSeparator)* {
    return [head.value, ...tail.map(literal => literal.value)]
  }

LiteralAfterListSeparator
  = ListSeparator value:Literal {
    return value
  }

ListSeparator
  = _ "," _

InRangeFilter
  = key:FieldName __ In _ startOperator:RangeStart start:Literal RangeSeparator end:Literal endOperator:RangeEnd {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { range: { [key]: { [startOperator]: start.value, [endOperator]: end.value } } }
  }

RangeStart
  = "[" { return "gte" }
  / "]" { return "gt" }

RangeEnd
  = "[" { return "lt" }
  / "]" { return "lte" }

RangeSeparator
  = _ ".." _
  / __ To __

InMultiValued
  = value:Literal __ In __ key:FieldName {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { term: {[key]: value.value} }
  }

To = "to"i

ComparisonFilter
  = key:FieldName _ operator:ComparisonOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    const esOperator = esOperators[operator]
    requiredCapability(prop, '_lt')
    return { range: { [key]: { [esOperator]: value.value } } }
  }

ComparisonOperator
  = "<="
  / "<"
  / ">="
  / ">"

StringFilter
  = literal:StringLiteral {
    return { multi_match: {query: literal.value, fields: options.searchFields, operator: 'and', type: 'cross_fields' } }
  }

OrFilter
  = before:AndFilter
    after:(__ Or __ AndFilter)* {
      if (!after.length) return before
      return {
        bool: {
          should: [before, ...after.map(a => a[3])]
        }
      }
    }

Or = "or"i

AndFilter
  = before:PrimaryFilter
    after:(__ And __ PrimaryFilter)* {
      if (!after.length) return before
      return {
        bool: {
          must: [before, ...after.map(a => a[3])]
        }
      }
   }

And = "and"i


NotFilter
  = _ Not __ filter:PrimaryFilter {
    return {
      bool: {
        must_not: [filter]
      }
    }
  }

Not = "not"i