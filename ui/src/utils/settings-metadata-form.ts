import { settingsSchema } from '#api/types'
import datasetSchema from '../../../api/types/dataset/schema.js'
import { schemaText } from './schema-i18n.ts'

const schema = settingsSchema.properties.datasetsMetadata as any
const properties: Record<string, any> = schema.properties

// the metadata of a dataset the settings know, read from the settings schema
export const standardMetadata = Object.entries(properties)
  .filter(([, prop]) => prop.properties?.active && (prop.properties.group || prop.properties.title))
  .map(([key, prop]) => {
    const { active, title, group, description, weight, recommendedMin, recommendedMax } = prop.properties
    return {
      key,
      active,
      defaultActive: !!active.default,
      alwaysActive: !!active.readOnly,
      renamable: !!title,
      hasGroup: !!group && !group.readOnly,
      defaultGroup: group?.default,
      hasHelp: !!description,
      hasWeight: !!weight,
      weight: weight?.default,
      min: recommendedMin?.default,
      max: recommendedMax?.default,
      unit: recommendedMin?.layout.props.suffix
    }
  })

// the texts of the form in a locale, the native help comes from the dataset schema
export const localizedMetadata = (locale: string) => Object.fromEntries(standardMetadata.map(({ active, ...m }) => {
  const native = (datasetSchema as any).properties[m.key]
  return [m.key, {
    ...m,
    title: schemaText(active, 'title', locale),
    info: schemaText(active, 'description', locale),
    nativeHelp: native?.['x-i18n-description'] && schemaText(native, 'description', locale)
  }]
}))
// the rows of the list: a metadata without settings yet starts from its default
export const standardMetadataItems = standardMetadata.map(m => ({ key: m.key, active: m.defaultActive }))

// the settings store one object per metadata, a vjsf list needs an array
export const toMetadataForm = (datasetsMetadata: Record<string, any> | null | undefined) => {
  const { ...form } = datasetsMetadata ?? {}
  form.standardMetadata = standardMetadata.filter(m => form[m.key]).map(m => ({ ...form[m.key], key: m.key }))
  for (const m of standardMetadata) delete form[m.key]
  return form
}
// the rows start from context.metadataItems: an activation left at its default is not stored, a row left empty neither
export const fromMetadataForm = ({ standardMetadata: items, ...datasetsMetadata }: Record<string, any>) => {
  for (const { key, ...item } of items ?? []) {
    const m = standardMetadata.find(m => m.key === key)
    if (m && (m.alwaysActive || item.active === m.defaultActive)) delete item.active
    if (Object.values(item).some(v => v !== undefined)) datasetsMetadata[key] = item
  }
  return datasetsMetadata
}

const meta = 'context.metadata[parent.data.key]'
const shown = `(parent.data.active || ${meta}.alwaysActive)`
const scoreActive = 'rootData.completeness?.active'

// a field of the list items, built on its definition in the settings schema
const field = (prop: any, ifExpr: string, getProps: string, cols?: number) => {
  return { ...prop, layout: { ...prop.layout, if: ifExpr, getProps, ...(cols && { cols }) } }
}

const items = {
  type: 'object',
  layout: {
    switch: [
      // the row only shows the title and subtitle of the list
      { if: 'summary', children: [] },
      // the switch, the category and the label on a line, the help below
      { children: [{ name: 'metadata-info' }, { key: 'active', cols: 4 }, { key: 'group', cols: 4 }, { key: 'title', cols: 4 }, 'description', 'weight', 'recommendedMin', 'recommendedMax'] }
    ]
  },
  properties: {
    key: { type: 'string', layout: 'none' },
    active: {
      type: 'boolean',
      title: 'Offer this metadata',
      'x-i18n-title': { fr: 'Proposer cette métadonnée' },
      layout: { comp: 'switch', if: `!${meta}.alwaysActive` }
    },
    title: {
      type: 'string',
      title: 'Custom label',
      'x-i18n-title': { fr: 'Libellé personnalisé' },
      layout: { if: `${shown} && ${meta}.renamable`, getProps: `({ placeholder: ${meta}.title, persistentPlaceholder: true })` }
    },
    group: field(properties.license.properties.group, `${shown} && ${meta}.hasGroup`, `({ ...layout.props, placeholder: context.labels.groups[${meta}.defaultGroup] })`),
    description: field(properties.license.properties.description, `${shown} && ${meta}.hasHelp`, `({ ...layout.props, placeholder: ${meta}.nativeHelp, persistentPlaceholder: !!${meta}.nativeHelp })`),
    weight: field(properties.license.properties.weight, `${shown} && ${scoreActive} && ${meta}.hasWeight`, `({ ...layout.props, placeholder: String(${meta}.weight) })`, 4),
    recommendedMin: field(properties.keywords.properties.recommendedMin, `${shown} && ${scoreActive} && !!${meta}.unit`, `({ ...layout.props, suffix: context.labels.units[${meta}.unit], placeholder: ${meta}.min === undefined ? undefined : String(${meta}.min), persistentPlaceholder: ${meta}.min !== undefined })`, 4),
    recommendedMax: field(properties.keywords.properties.recommendedMax, `${shown} && ${scoreActive} && !!${meta}.unit`, `({ ...layout.props, suffix: context.labels.units[${meta}.unit], placeholder: ${meta}.max === undefined ? undefined : String(${meta}.max), persistentPlaceholder: ${meta}.max !== undefined })`, 4)
  }
}

export const metadataFormSchema = {
  ...schema,
  layout: {
    title: null,
    children: ['informationsTitle', 'coverageTitle', 'groups', 'completeness', 'standardMetadata', 'custom']
  },
  properties: {
    informationsTitle: properties.informationsTitle,
    coverageTitle: properties.coverageTitle,
    groups: properties.groups,
    completeness: properties.completeness,
    standardMetadata: {
      type: 'array',
      title: 'Standard metadata',
      'x-i18n-title': { fr: 'Métadonnées standard' },
      layout: {
        comp: 'list',
        listEditMode: 'inline-single',
        listActions: ['edit'],
        getItems: { expr: 'context.metadataItems', itemKey: 'item.key', immutable: true },
        itemTitle: 'item.title || context.metadata[item.key].title',
        itemSubtitle: 'context.metadataSubtitles[item.key]'
      },
      items
    },
    custom: properties.custom
  }
}
