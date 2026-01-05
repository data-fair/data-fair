// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
{{
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { requiredCapability } from '../../datasets/es/commons.js'
import dayjs from 'dayjs'
}}

// https://help.opendatasoft.com/apis/ods-explore-v2/#section/Opendatasoft-Query-Language-(ODSQL)/Order-by-clause
// https://help.opendatasoft.com/apis/ods-explore-v2/#section/ODSQL-aggregate-functions

start
  = Refine

Refine
  = before:RefineExpression
    after:(_ "," _ RefineExpression)* {
      const filters = [before, ...after.map(a => a[3])]
      return filters
   }


RefineExpression
  = key:FieldName _ ":" _ value:RefineValue {
    const prop = options.dataset.schema.find(p => p.key === key)
    if (!prop) throw httpError(400, `Impossible d'appliquer un filtre sur le champ ${key}, il n'existe pas dans le jeu de données.`)
    if (prop.type === 'string' && prop.format === 'date-time' && value.format) {
      const date = dayjs.tz(value.value, value.format, options.timezone ?? 'UTC')
      const startDate = date.toISOString()
      const endDate = date.endOf(value.level).toISOString()
      return { range: { [key]: { gte: startDate, lte: endDate } } }
    } else if (prop.type === 'string' && prop.format === 'date-time' && typeof value.value === 'number') {
      const date = dayjs.tz(value.value + '', 'YYYY', options.timezone ?? 'UTC')
      const startDate = date.toISOString()
      const endDate = date.endOf('year').toISOString()
      return { range: { [key]: { gte: startDate, lte: endDate } } }
    } else {
      requiredCapability(prop, 'equal')
      return { term: { [key]: value.value } }  
    }
  }

RefineValue
  = value:DateValue { return value }
  / "'" value:DateValue "'" { return value }
  / "\"" value:DateValue "\"" { return value }
  / "'" value:DateYear "'" { return {format: 'YYYY', value: value, level: 'year' } }
  / "\"" value:DateYear "\"" { return {format: 'YYYY', value: value, level: 'year' } }
  / value:Literal { return value }
  / name:IdentifierName { return {value: name.name} }

DateValue
  = year:DateYear "/" month:DateMonth "/" day:DateDay { return {format: 'YYYY/MM/DD', value: `${year}/${month}/${day}`, level: 'day'} }
  / year:DateYear "-" month:DateMonth "-" day:DateDay { return {format: 'YYYY-MM-DD', value: `${year}-${month}-${day}`, level: 'day'} }
  / year:DateYear "/" month:DateMonth { return {format: 'YYYY/MM', value: `${year}/${month}`, level: 'month'} }
  / year:DateYear "-" month:DateMonth { return {format: 'YYYY-MM', value: `${year}-${month}`, level: 'month'} }