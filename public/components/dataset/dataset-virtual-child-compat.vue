<template>
  <ul>
    <li
      v-for="message,i of info"
      :key="`info-${i}`"
      class="success--text"
    >
      {{ message }}
    </li>
    <li
      v-for="message,i of warning"
      :key="`warning-${i}`"
      class="warning--text"
    >
      {{ message }}
    </li>
    <li
      v-for="message,i of error"
      :key="`error-${i}`"
      class="error--text"
    >
      {{ message }}
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
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    child: { type: Object, required: true },
    parentSchema: { type: Array, required: true }
  },
  computed: {
    ...mapState(['vocabulary', 'propertyTypes']),
    info () {
      const messages = []
      const additionalFields = this.child.schema
        .filter(f => !f['x-calculated'])
        .filter(f => !this.parentSchema.find(pf => pf.key === f.key))
      if (additionalFields.length) {
        messages.push(this.$t('additionalFields', { fields: additionalFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
      }
      return messages
    },
    warning () {
      const messages = []
      const missingFields = this.parentSchema
        .filter(f => !f['x-calculated'])
        .filter(f => !this.child.schema.find(cf => cf.key === f.key))
      if (missingFields.length) {
        messages.push(this.$t('missingFields', { fields: missingFields.map(f => f.title || f['x-originalName'] || f.key).join(', ') }))
      }
      return messages
    },
    error () {
      const messages = []
      if (this.child.status === 'error') {
        messages.push(this.$t('statusError'))
      }
      for (const field of this.child.schema) {
        const parentField = this.parentSchema.find(pf => pf.key === field.key)
        if (!parentField) continue
        const childType = this.matchPropertyType(field)
        const parentType = this.matchPropertyType(parentField)
        if (childType !== parentType) {
          messages.push(this.$t('typeMismatch', {
            field: field.title || field['x-originalName'] || field.key,
            childType: childType.title,
            parentType: parentType.title
          }))
        }
        const childConcept = (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description) || this.$t('none')
        const parentConcept = (parentField['x-refersTo'] && this.vocabulary && this.vocabulary[parentField['x-refersTo']] && this.vocabulary[parentField['x-refersTo']].description) || this.$t('none')
        if (childConcept !== parentConcept) {
          messages.push(this.$t('conceptMismatch', {
            field: field.title || field['x-originalName'] || field.key,
            childConcept,
            parentConcept
          }))
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
