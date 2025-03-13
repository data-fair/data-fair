// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../../datasets/es/commons.js'
}}

start
  = Filter*

Filter
  = StringFilter
  / EqualityFilter

EqualityFilter
  = key:IdentifierName _ Equal _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key.name)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key.name}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, '_eq')
    return { term: { [key.name]: value.value } }
  }

Equal
  = ":"
  / "="

StringFilter
  = literal:StringLiteral {
    return { multi_match: {query: literal.value, fields: options.searchFields, operator: 'and', type: 'cross_fields' } }
  }

