// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../../datasets/es/commons.js'
import { wktToGeoJSON } from '@terraformer/wkt'


const esOperators = {
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte'
}

const geoShapeQuery = (dataset, shape, relation) => {
  if (!dataset.bbox) throw httpError(400, 'geo filter cannot be used on this dataset. It is not geolocalized.')
  if (typeof shape === 'string') shape = wktToGeoJSON(shape)
  const geoShapeProp = dataset.schema.find(p => p.key === '_geoshape')
  const geoShape = geoShapeProp && (!geoShapeProp['x-capabilities'] || geoShapeProp['x-capabilities'].geoShape !== false)
  const geoCornersProp = dataset.schema.find(p => p.key === '_geocorners')
  const geoCorners = geoCornersProp && (!geoCornersProp['x-capabilities'] || geoCornersProp['x-capabilities'].geoCorners !== false)
  return {
    geo_shape: {
      [geoShape ? '_geoshape' : (geoCorners ? '_geocorners' : '_geopoint')]: {
        relation,
        shape
      }
    }
  }
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
  / SearchFunction
  / SuggestFunction
  / StartsWithFunction
  / WithinDistanceFunction
  / InBboxFunction
  / IntersectsFunction
  / DisjointFunction
  / WithinFunction
  / "(" _ filter:Filter _ ")" { return filter }

EqualityFilter
  = key:FieldName _ EqualOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    requiredCapability(prop, 'equal')
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
    requiredCapability(prop, 'IN')
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
    requiredCapability(prop, 'range')
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
    requiredCapability(prop, 'IN')
    return { term: {[key]: value.value} }
  }

To = "to"i

ComparisonFilter
  = key:FieldName _ operator:ComparisonOperator _ value:Literal {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    const esOperator = esOperators[operator]
    requiredCapability(prop, 'comparison')
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

FieldNamesList
  = head:FieldName tail:(FieldNameAfterListSeparator)* {
    return [head, ...tail]
  }

FieldNameAfterListSeparator
  = ListSeparator value:FieldName {
    return value
  }

SearchFieldNames
  = fieldNames:FieldNamesList {
    return options.searchFields.filter(sf => fieldNames.some(f => sf.startsWith(f + '.')))
  }
  / '*' {
    return options.searchFields
  }

StringFieldNames
  = fieldNames:FieldNamesList {
    for (const key of fieldNames) {
      const prop = options.dataset.schema.find(p => p.key === key)
      if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      requiredCapability(prop, 'startswith')
    }
    return fieldNames
  }
  / '*' {
    return options.dataset.schema.filter(prop => prop['x-capabilities']?.index !== false).map(prop => prop.key)
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/search()
SearchFunction
  = "search"i '(' fieldNames:SearchFieldNames ListSeparator value:StringLiteral ')' {
    return {
      multi_match: {
        query: value.value,
        fuzziness: 'AUTO',
        type: 'bool_prefix',
        fields: fieldNames
      }
    }
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/suggest()
SuggestFunction
  = "suggest"i '(' fieldNames:SearchFieldNames ListSeparator value:StringLiteral ')' {
    return {
      multi_match: {
        query: value.value,
        type: 'phrase_prefix',
        fields: fieldNames
      }
    }
  }

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/startswith()
StartsWithFunction
  = "startswith"i '(' fieldNames:StringFieldNames ListSeparator value:StringLiteral ')' {
    return {
      bool: {
        should: fieldNames.map(f => ({prefix: {[f]: value.value}}))
      }
    }
  }

DistanceUnit
  = 'm'
  / 'mi'
  / 'yd'
  / 'ft'
  / 'cm'
  / 'km'
  / 'mm'

Distance
  = value:NumericLiteral unit:DistanceUnit? {
    return '' + value.value + unit
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/within_distance()
WithinDistanceFunction
  = "within_distance"i '(' FieldName ListSeparator geometry:GeometryLiteral ListSeparator distance:Distance ')' {
    if (!options.dataset.bbox) throw httpError(400, '"within_distance" filter cannot be used on this dataset. It is not geolocalized.')
    let point
    if (typeof geometry === 'string') {
      // case of WKT
      point = geometry
    } else if (geometry.type === 'Point') {
      point = geometry.coordinates
    } else if (geometry.geometry?.type === 'Point') {
      point = geometry.geometry.coordinates
    } else {
      throw httpError(400, `The geometry must be a point, got ${JSON.stringify(geometry)}`)
    }
    return {
      geo_distance: {
        distance,
        // TODO: use _geoshape after upgrading ES
        _geopoint: point
      }
    }
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/in_bbox()
InBboxFunction
  = 'in_bbox'i '(' FieldName ListSeparator lat1:NumericLiteral ListSeparator lon1:NumericLiteral ListSeparator lat2:NumericLiteral ListSeparator lon2:NumericLiteral ')' {
    const left = lat1.value
    const bottom = lon1.value
    const right = lat2.value
    const top = lon2.value
    return geoShapeQuery(options.dataset, { type: 'envelope', coordinates: [[left, top], [right, bottom]] }, 'intersects')
    
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/intersects()
IntersectsFunction
  = 'intersects'i '(' FieldName ListSeparator geometry: GeometryLiteral ')' {
    return geoShapeQuery(options.dataset, geometry, 'intersects')
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/disjoint()
DisjointFunction
  = 'disjoint'i '(' FieldName ListSeparator geometry: GeometryLiteral ')' {
    return geoShapeQuery(options.dataset, geometry, 'disjoint')
  }

// cf https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-predicates/within()
WithinFunction
  = 'within'i '(' FieldName ListSeparator geometry: GeometryLiteral ')' {
    return geoShapeQuery(options.dataset, geometry, 'within')
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