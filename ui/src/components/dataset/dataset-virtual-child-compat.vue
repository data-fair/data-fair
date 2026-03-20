<template>
  <ul>
    <li
      v-for="(message, i) of messages.info"
      :key="`info-${i}`"
      class="text-success"
    >
      {{ message }}
    </li>
    <li
      v-for="(message, i) of messages.warning"
      :key="`warning-${i}`"
      class="text-warning"
    >
      {{ t('warning') }} - {{ message }}
    </li>
    <li
      v-for="(message, i) of messages.error"
      :key="`error-${i}`"
      class="text-error"
    >
      {{ t('error') }} - {{ message }}
    </li>
  </ul>
</template>

<script lang="ts" setup>
import capabilitiesSchema from '../../../../api/contract/capabilities.js'
import { propertyTypes } from '~/utils/dataset'
import useStore from '~/composables/use-store'

const props = defineProps<{
  child: { schema: any[], status?: string },
  parentSchema: any[]
}>()

const { t } = useI18n()
const { vocabulary } = useStore()

const capabilitiesProperties = capabilitiesSchema.properties as Record<string, { type: string, default: boolean, 'x-display': string, title: string, description: string }>
const capabilitiesDefaultFalse = Object.keys(capabilitiesProperties)
  .filter((key: string) => capabilitiesProperties[key].default === false)

function matchPropertyType (p: any) {
  return propertyTypes.find(pt =>
    pt.type === p.type && (pt.format || null) === (p.format || null) && (pt['x-display'] || null) === (p['x-display'] || null)
  )
}

const messages = computed(() => {
  const messages = { info: [] as string[], warning: [] as string[], error: [] as string[] }

  // Additional fields in child not in parent
  const additionalFields = props.child.schema
    .filter(f => !f['x-calculated'])
    .filter(f => !props.parentSchema.find(pf => pf.key === f.key))
  if (additionalFields.length) {
    messages.info.push(t('additionalFields', { fields: additionalFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
  }

  // Missing fields
  const missingFields = props.parentSchema
    .filter(f => !f['x-calculated'])
    .filter(f => !props.child.schema.find(cf => cf.key === f.key))
  if (missingFields.length) {
    messages.warning.push(t('missingFields', { fields: missingFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
  }

  // Error status
  if (props.child.status === 'error') {
    messages.error.push(t('statusError'))
  }

  // Per-field checks
  for (const field of props.child.schema) {
    const parentField = props.parentSchema.find(pf => pf.key === field.key)
    if (!parentField) continue

    // Type mismatch
    const childType = matchPropertyType(field)
    const parentType = matchPropertyType(parentField)
    if (childType !== parentType) {
      messages.error.push(t('typeMismatch', {
        field: field.title || field['x-originalName'] || field.key,
        childType: childType?.title ?? '?',
        parentType: parentType?.title ?? '?'
      }))
    }

    // Concept mismatch
    const childConcept = (field['x-refersTo'] && vocabulary.value?.[field['x-refersTo']]?.title) || t('none')
    const parentConcept = (parentField['x-refersTo'] && vocabulary.value?.[parentField['x-refersTo']]?.title) || t('none')
    if (childConcept !== parentConcept) {
      messages.error.push(t('conceptMismatch', {
        field: field.title || field['x-originalName'] || field.key,
        childConcept,
        parentConcept
      }))
    }

    // Capability mismatches
    const childCapabilities = field['x-capabilities'] || {}
    const parentCapabilities = parentField['x-capabilities'] || {}
    for (const key in childCapabilities) {
      const parentHasCapability = capabilitiesDefaultFalse.includes(key) ? parentCapabilities[key] === true : parentCapabilities[key] !== false
      const childHasCapability = capabilitiesDefaultFalse.includes(key) ? childCapabilities[key] === true : childCapabilities[key] !== false
      if (!childHasCapability && parentHasCapability) {
        messages.warning.push(t('disabledConfig', {
          field: field.title || field['x-originalName'] || field.key,
          param: capabilitiesProperties[key]?.title ?? key
        }))
      }
    }
    for (const key in parentCapabilities) {
      if (parentCapabilities[key] === false && childCapabilities[key] !== false) {
        messages.warning.push(t('unusedConfig', {
          field: field.title || field['x-originalName'] || field.key,
          param: capabilitiesProperties[key]?.title ?? key
        }))
      }
    }
  }

  return messages
})
</script>

<i18n lang="yaml">
fr:
  additionalFields: contient des colonnes non représentées dans le jeu virtuel ({fields})
  missingFields: ne contient pas certaines colonnes du jeu virtuel ({fields})
  typeMismatch: "le type \"{childType}\" de la colonne {field} ne correspond pas au type dans le jeu virtuel \"{parentType}\""
  statusError: le jeu de données est en erreur
  none: aucun
  conceptMismatch: "le concept \"{childConcept}\" de la colonne \"{field}\" ne correspond pas au concept dans le jeu virtuel \"{parentConcept}\""
  disabledConfig: "la configuration technique \"{param}\" de la colonne \"{field}\" est désactivée mais active dans le jeu virtuel"
  unusedConfig: "la configuration technique \"{param}\" de la colonne \"{field}\" est activée mais inactive dans le jeu virtuel"
  warning: avertissement
  error: erreur
en:
  additionalFields: contains columns absent in the virtual dataset ({fields})
  missingFields: does not contain some columns of the virtual dataset ({fields})
  typeMismatch: "the type \"{childType}\" of the column {field} does not match the type in the virtual dataset \"{parentType}\""
  statusError: the dataset is in error state
  none: none
  conceptMismatch: "the concept \"{childConcept}\" of the column \"{field}\" does not match the concept in the virtual dataset \"{parentConcept}\""
  disabledConfig: "technical configuration \"{param}\" of the column \"{field}\" is disabled but active in the virtual dataset"
  unusedConfig: "technical configuration \"{param}\" of the column \"{field}\" is active but disabled in the virtual dataset"
  warning: warning
  error: error
</i18n>
