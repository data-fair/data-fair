<template lang="html">
  <div
    v-if="editSchema && mergedModel"
    :lazy-validation="true"
  >
    <tutorial-alert
      id="edit-multiple-lines"
      :text="$t('warning')"
    />
    <tutorial-alert
      id="edit-multiple-lines2"
      :text="$t('warning2')"
    />
    <lazy-v-jsf
      v-model="mergedModel"
      :schema="editSchema"
      :options="vjsfOptions"
      @input="val => $emit('input', val)"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  warning: En mode édition de lignes multiples les valeurs sont visibles uniquement si elles sont égales dans toutes les lignes sélectionnées. Les propriétés dont les valeurs sont hétérogènes sont vides et ont un fond gris, si vous les laissez vides elles ne seront pas modifiées à l'enregistrement.
  warning2: Certains types de champs (date, couleur, etc) ne supportent pas la modification de valeurs hétérogènes et ne sont pas éditables dans ce cas.
en:
</i18n>

<script>

import { mapState } from 'vuex'
export default {
  props: ['selectedCols', 'lines'],
  data: () => ({
    vjsfOptions: {
      locale: 'fr',
      removeAdditionalProperties: true,
      hideReadOnly: true,
      textareaProps: {
        outlined: true
      },
      arrayItemCardProps: {
        outlined: true,
        tile: true
      },
      dialogCardProps: {
        outlined: true
      }
    },
    mergedModel: null
  }),
  computed: {
    ...mapState('dataset', ['dataset', 'lineUploadProgress', 'jsonSchema']),
    editSchema () {
      if (!this.jsonSchema) return
      const schema = JSON.parse(JSON.stringify(this.jsonSchema))
      Object.keys(schema.properties).forEach(key => {
        if (this.selectedCols && this.selectedCols.length && !this.selectedCols.includes(key)) {
          schema.properties[key].readOnly = true
        }
        if (!this.homogenousProperties.includes(key)) {
          if (['string', 'number', 'integer'].includes(schema.properties[key].type) && !schema.properties[key].format && !schema.properties[key]['x-display']) {
            schema.properties[key]['x-props'] = schema.properties[key]['x-props'] || {}
            schema.properties[key]['x-props'].filled = true
          } else {
            schema.properties[key].readOnly = true
          }
        }
        if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument') {
          delete schema.properties[key]
        }
      })
      return schema
    },
    homogenousProperties () {
      if (!this.jsonSchema) return
      const homogenousProperties = []
      for (const key of Object.keys(this.jsonSchema.properties)) {
        const values = []
        for (const line of this.lines) {
          if (!values.includes(line[key])) values.push(line[key])
        }
        if (values.length <= 1) homogenousProperties.push(key)
      }
      return homogenousProperties
    }
  },
  async created () {
    if (!this.jsonSchema) await this.$store.dispatch('dataset/fetchJsonSchema')
    const mergedModel = {}
    for (const prop of this.homogenousProperties) {
      mergedModel[prop] = this.lines[0][prop]
    }
    this.mergedModel = mergedModel
    this.$emit('input', mergedModel)
  }
}
</script>

<style lang="css">
.vjsf-property.heterogenous {
  border: 1px solid grey;
  padding: 4px !important;
  margin-top: 4px !important;
  margin-bottom: 4px !important;
  border-radius: 4px;
}
</style>
