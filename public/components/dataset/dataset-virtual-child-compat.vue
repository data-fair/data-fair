<template>
  <ul>
    <li
      v-for="message,i of messages.info"
      :key="`info-${i}`"
      class="success--text"
    >
      {{ message }}
    </li>
    <li
      v-for="message,i of messages.warning"
      :key="`warning-${i}`"
      class="warning--text"
    >
      {{ $t('warning') }} - {{ message }}
    </li>
    <li
      v-for="message,i of messages.error"
      :key="`error-${i}`"
      class="error--text"
    >
      {{ $t('error') }} - {{ message }}
    </li>
  </ul>
</template>

<i18n lang="yaml">
fr:
  additionalFields: contient des colonnes non représentées dans le jeu virtuel ({fields})
  missingFields: ne contient pas certaines colonnes du jeu virtuel ({fields})
  typeMismatch: "le type \"{childType}\" de la colonne {field} ne correspond pas au type dans le jeu virtuel \"{parentType}\""
  statusError: le jeu de données est en erreur
  none: aucun
  conceptMismatch: "le concept \"{childConcept}\" de la colonne {field} ne correspond pas au concept dans le jeu virtuel \"{parentConcept}\""
  disabledConfig: "la configuration technique \"{param}\" de la colonne {field} est désactivée mais active dans le jeu virtuel"
  unusedConfig: "la configuration technique \"{param}\" de la colonne {field} est activée mais inactive dans le jeu virtuel"
  warning: avertissement
  error: erreur
en:
  additionalFields: contains columns absent in the virtual dataset ({fields})
  missingFields: does not contain some columns of the virtual dataset ({fields})
  typeMismatch: "the type \"{childType}\" of the column {field} does not match the type in the virtual dataset \"{parentType}\""
  statusError: the dataset is in error state
  none: none
  conceptMismatch: "the concept \"{childConcept}\" of the column {field} does not match the concept in the virtual dataset \"{parentConcept}\""
  disabledConfig: "technical configuration \"{param}\" of the column {field} is disabled but active in the virtual dataset"
  unusedConfig: "technical configuration \"{param}\" of the column {field} is active but disabled in the virtual dataset"
  warning: warning
  error: error
</i18n>

<script>
import { mapState } from 'vuex'
const capabilitiesSchema = require('~/../contract/capabilities.js')

export default {
  props: {
    child: { type: Object, required: true },
    parentSchema: { type: Array, required: true }
  },
  computed: {
    ...mapState(['vocabulary', 'propertyTypes']),
    messages () {
      const messages = { info: [], warning: [], error: [] }

      const additionalFields = this.child.schema
        .filter(f => !f['x-calculated'])
        .filter(f => !this.parentSchema.find(pf => pf.key === f.key))
      if (additionalFields.length) {
        messages.info.push(this.$t('additionalFields', { fields: additionalFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
      }

      const missingFields = this.parentSchema
        .filter(f => !f['x-calculated'])
        .filter(f => !this.child.schema.find(cf => cf.key === f.key))
      if (missingFields.length) {
        messages.warning.push(this.$t('missingFields', { fields: missingFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
      }

      if (this.child.status === 'error') {
        messages.error.push(this.$t('statusError'))
      }
      for (const field of this.child.schema) {
        const parentField = this.parentSchema.find(pf => pf.key === field.key)
        if (!parentField) continue
        const childType = this.matchPropertyType(field)
        const parentType = this.matchPropertyType(parentField)
        if (childType !== parentType) {
          messages.error.push(this.$t('typeMismatch', {
            field: field.title || field['x-originalName'] || field.key,
            childType: childType.title,
            parentType: parentType.title
          }))
        }
        const childConcept = (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description) || this.$t('none')
        const parentConcept = (parentField['x-refersTo'] && this.vocabulary && this.vocabulary[parentField['x-refersTo']] && this.vocabulary[parentField['x-refersTo']].description) || this.$t('none')
        if (childConcept !== parentConcept) {
          messages.error.push(this.$t('conceptMismatch', {
            field: field.title || field['x-originalName'] || field.key,
            childConcept,
            parentConcept
          }))
        }

        const childCapabilities = field['x-capabilities'] || {}
        const parentCapabilities = parentField['x-capabilities'] || {}
        for (const key in childCapabilities) {
          if (childCapabilities[key] === false && parentCapabilities[key] !== false) {
            messages.warning.push(this.$t('disabledConfig', {
              field: field.title || field['x-originalName'] || field.key,
              param: capabilitiesSchema.properties[key].title
            }))
          }
        }
        for (const key in parentCapabilities) {
          if (parentCapabilities[key] === false && childCapabilities[key] !== false) {
            messages.warning.push(this.$t('unusedConfig', {
              field: field.title || field['x-originalName'] || field.key,
              param: capabilitiesSchema.properties[key].title
            }))
          }
        }
      }
      return messages
    }
  },
  methods: {
    matchPropertyType (p) {
      return this.propertyTypes.find(pt => {
        return pt.type === p.type && (pt.format || null) === (p.format || null) && (pt['x-display'] || null) === (p['x-display'] || null)
      })
    }
  }
}
</script>

<style>

</style>
