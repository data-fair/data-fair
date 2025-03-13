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
  = Filter*

Filter
  = OrFilter

SimpleFilter
  = StringFilter
  / EqualityFilter
  / ComparisonFilter

EqualityFilter
  = key:IdentifierName _ EqualOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key.name)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key.name}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { term: { [key.name]: value.value } }
  }

EqualOperator
  = ":"
  / "="

ComparisonFilter
  = key:IdentifierName _ operator:ComparisonOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key.name)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key.name}, il n'existe pas dans le jeu de données.`)
    const esOperator = esOperators[operator]
    requiredCapability(prop, '_lt')
    return { range: { [key.name]: { [esOperator]: value.value } } }
  }

ComparisonOperator
  = "<"
  / "<="
  / ">"
  / ">="

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

Or
  = "or"
  / "OR"

AndFilter
  = before:SimpleFilter
    after:(__ And __ SimpleFilter)* {
      if (!after.length) return before
      return {
        bool: {
          filter: [before, ...after.map(a => a[3])]
        }
      }
   }

And
  = "and"
  / "AND"

