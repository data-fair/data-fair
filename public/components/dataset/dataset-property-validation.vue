<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="toggle"
  >
    <template #activator="{on, attrs}">
      <v-btn
        v-if="!property['x-calculated'] && !property['x-extension']"
        fab
        small
        depressed
        dark
        v-bind="attrs"
        :title="$t('validationConfig')"
        v-on="on"
      >
        <v-icon>mdi-check-decagram</v-icon>
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title v-t="'validationConfig'" />
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3 pb-0">
        <v-form ref="form">
          <v-checkbox
            v-model="property['x-required']"
            :label="$t('required')"
            :disabled="!editable"
          />
          <v-checkbox
            v-if="property['x-labels'] && Object.keys(property['x-labels']).length > 0"
            v-model="property['x-labelsRestricted']"
            :label="$t('restricted')"
            :disabled="!editable"
          />
          <v-text-field
            v-if="property.type === 'string' && !property.format"
            v-model="property.pattern"
            :label="$t('pattern')"
            :disabled="!editable"
          />
          <v-text-field
            v-if="property.type === 'number'"
            v-model="property.minimum"
            :label="$t('minimum')"
            :disabled="!editable"
            type="number"
          />
          <v-text-field
            v-if="property.type === 'number'"
            v-model="property.maximum"
            :label="$t('maximum')"
            :disabled="!editable"
            type="number"
          />
          <v-text-field
            v-if="property.type === 'string' && !property.format"
            v-model="property.minLength"
            :label="$t('multipleOf')"
            :disabled="!editable"
            type="number"
            min="0"
          />
          <v-text-field
            v-if="property.type === 'string' && !property.format"
            v-model="property.maxLength"
            :label="$t('maxLength')"
            :disabled="!editable"
            type="number"
            min="0"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  validationConfig: Configuration de la validation des données
  required: information obligatoire
  restricted: cochez cette case pour restreindre les données aux valeurs avec libellés associés
  pattern: Format
  minimum: Minimum
  maximum: Maximum
  minLength: Longueur minimale
  maxLength: Longueur maximale
en:
  validationConfig: Data validation configuration
  required: required information
  restricted: check this box to restrict data to values with associated labels
  pattern: Format
  minimum: Minimum
  maximum: Maximum
  minLength: Minimum length
  maxLength: Maximum length
</i18n>

<script>

export default {
  props: ['editable', 'property'],
  data () {
    return {
      dialog: false,
      editCapabilities: null
    }
  },
  computed: { },
  methods: { }
}
</script>

<style>

</style>
