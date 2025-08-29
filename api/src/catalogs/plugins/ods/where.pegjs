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
  / RangeFilter
  / ComparisonFilter
  / NotFilter
  / "(" _ filter:Filter _ ")" { return filter }

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

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/IN-filter
InLiteralsFilter
  = key:IdentifierName __ In _ "(" values:LiteralsList ")" {
    return { terms: {[key.name]: values }}
  }

In
  = "in"
  / "IN"
  / "In"

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

RangeFilter
  = key: IdentifierName __ In _ startOperator:RangeStart start:Literal RangeSeparator end:Literal endOperator:RangeEnd {
    return { range: { [key.name]: { [startOperator]: start.value, [endOperator]: end.value } } }
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

To
  = "to"
  / "TO"
  / "To"

ComparisonFilter
  = key:IdentifierName _ operator:ComparisonOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key.name)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key.name}, il n'existe pas dans le jeu de données.`)
    const esOperator = esOperators[operator]
    requiredCapability(prop, '_lt')
    return { range: { [key.name]: { [esOperator]: value.value } } }
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

Or
  = "or"
  / "OR"
  / "Or"

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

And
  = "and"
  / "AND"
  / "And"


NotFilter
  = _ Not __ filter:PrimaryFilter {
    return {
      bool: {
        must_not: [filter]
      }
    }
  }

Not
  = "not"
  / "NOT"
  / "Not"