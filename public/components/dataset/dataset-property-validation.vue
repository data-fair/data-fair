<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
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
          <tutorial-alert
            v-if="dataset.isRest"
            id="validation-rest"
            :text="$t('validationRestMessage')"
            persistent
          />
          <tutorial-alert
            v-else
            id="validation-file"
            :text="$t('validationFileMessage')"
            persistent
          />
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
            v-if="property.type === 'number' || property.type === 'integer'"
            :value="property.minimum"
            :label="$t('minimum')"
            :disabled="!editable"
            type="number"
            clearable
            @input="setNumberProp('minimum', $event)"
          />
          <v-text-field
            v-if="property.type === 'number' || property.type === 'integer'"
            :value="property.maximum"
            :label="$t('maximum')"
            :disabled="!editable"
            type="number"
            clearable
            @input="setNumberProp('maximum', $event)"
          />
          <v-text-field
            v-if="property.type === 'string' && !property.format"
            :value="property.minLength"
            :label="$t('minLength')"
            :disabled="!editable"
            type="number"
            min="0"
            clearable
            @input="setNumberProp('minLength', $event)"
          />
          <v-text-field
            v-if="property.type === 'string' && !property.format"
            :value="property.maxLength"
            :label="$t('maxLength')"
            :disabled="!editable"
            type="number"
            min="0"
            clearable
            @input="setNumberProp('maxLength', $event)"
          />
          <template v-if="property.type === 'string' && !property.format">
            <tutorial-alert
              id="validation-regexp"
              :text="$t('validationRegexpMessage')"
              persistent
            />
            <v-text-field
              v-model="property.pattern"
              :label="$t('pattern')"
              :disabled="!editable"
              clearable
              @click:clear="delete property.pattern"
            />
          </template>
          <template v-if="property.type === 'string' && property.format === 'date'">
            <tutorial-alert
              id="validation-date-format"
              :text="$t('dateFormatMessage')"
              persistent
            />
            <v-select
              v-model="property.dateFormat"
              :label="$t('dateFormat')"
              :disabled="!editable"
              clearable
              :items="dateFormats"
              @click:clear="delete property.dateFormat"
            />
          </template>
          <template v-if="property.type === 'string' && property.format === 'date-time'">
            <tutorial-alert
              id="validation-date-time-format"
              :text="$t('dateTimeFormatMessage')"
              persistent
            />
            <v-select
              v-model="property.dateTimeFormat"
              :label="$t('dateTimeFormat')"
              :disabled="!editable"
              clearable
              :items="dateTimeFormats"
              @click:clear="delete property.dateTimeFormat"
            />
          </template>
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
  validationRestMessage: Ces règles de validation seront appliquées dans les formulaires d'édition et vérifiées au moment de la réception de la donnée par la plateforme.
  validationFileMessage: Ces règles de validation seront appliquées lors de l'analyse des nouvelles versions de fichier. Les brouillons ne seront pas automatiquement validés si des erreurs sont détectées.
  validationRegexpMessage: La définition du format est basée sur une expression régulière. Il s'agit d'un paramétrage avancé.
  dateFormatMessage: Vous pouvez choisir un format de date accepté. Par défaut le seul format accepté est ISO 8601.
  dateFormat: Formattage de date
  dateTimeFormatMessage: Vous pouvez choisir un format de date et heure accepté. Par défaut le seul format accepté est IS0 8601.
  dateTimeFormat: Formattage de date et heure
en:
  validationConfig: Data validation configuration
  required: required information
  restricted: check this box to restrict data to values with associated labels
  pattern: Format
  minimum: Minimum
  maximum: Maximum
  minLength: Minimum length
  maxLength: Maximum length
  validationRestMessage: These validation rules will be applied in the edition forms and checked when the data is received by the platform.
  validationFileMessage: These validation rules will be applied when analyzing new file versions. Drafts will not be automatically validated if errors are detected.
  validationRegexpMessage: The format definition is based on a regular expression. This is an advanced setting.
  dateFormatMessage: You can chose an accepted date format. By default only ISO 8601 is accepted.
  dateFormat: Date format
  dateTimeFormatMessage: You can chose an accepted datetime format. By default only ISO 8601 is accepted.
  dateTimeFormat: Datetime format
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: ['editable', 'property'],
  data () {
    return {
      dialog: false,
      editCapabilities: null,
      dateFormats: process.env.dateFormats,
      dateTimeFormats: process.env.dateTimeFormats
    }
  },
  computed: {
    ...mapState('dataset', ['dataset'])
  },
  methods: {
    setNumberProp (prop, value) {
      this.$set(this.property, prop, parseInt(value))
      if (isNaN(this.property[prop])) {
        delete this.property[prop]
      }
    }
  }
}
</script>

<style>

</style>
