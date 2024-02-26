<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="toggle"
  >
    <template #activator="{on, attrs}">
      <v-btn
        fab
        small
        depressed
        dark
        v-bind="attrs"
        title="libellés"
        v-on="on"
      >
        <v-icon>mdi-tag-text-outline</v-icon>
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title v-t="'labels'" />
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <tutorial-alert
          id="labels"
          :text="$t('tutorialLabels')"
          persistent
        />

        <v-checkbox
          v-model="property['x-labelsRestricted']"
          :label="$t('restricted')"
          :disabled="!editable"
        />

        <v-form ref="form">
          <lazy-v-jsf
            v-if="editLabels"
            v-model="editLabels"
            :schema="schema"
            :options="{disableAll: !editable, editMode: 'inline'}"
            @change="apply"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  labels: Libellés
  tutorialLabels: Saisissez des libellés associés à des valeurs présentes dans la donnée pour améliorer la présentation dans les applications.
  restricted: cochez cette case pour restreindre les futures données aux valeurs ci-dessous
en:
  labels: Labels
  tutorialLabels: Enter some labels associate to values present in the data to improve the display in applications.
  restricted: check this box to restrict future data to the values below
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: ['editable', 'property', 'isRest'],
  data () {
    return {
      dialog: false,
      editLabels: null
    }
  },
  computed: {
    ...mapState('session', ['user']),
    schema () {
      const value = { type: 'string', title: 'valeur', 'x-cols': 6, 'x-class': 'pr-2' }
      if (this.property.type === 'boolean') value.enum = ['true', 'false']
      if (this.property.enum) value.examples = this.property.enum
      return {
        type: 'array',
        title: ' ',
        items: {
          type: 'object',
          required: ['value'],
          properties: {
            value,
            label: { type: 'string', title: 'libellé', 'x-cols': 6 }
          }
        }
      }
    }
  },
  methods: {
    toggle (show) {
      if (show) {
        this.editLabels = Object.keys(this.property['x-labels'] || {})
          .map(key => ({ value: key, label: this.property['x-labels'][key] }))
      } else {
        this.editLabels = null
      }
    },
    apply () {
      const labels = this.editLabels
        .filter(item => !!item.value)
        .reduce((a, item) => { a[item.value] = item.label || ''; return a }, {})
      console.log('labels', labels)
      if (Object.keys(labels).length) this.$set(this.property, 'x-labels', labels)
      else this.$delete(this.property, 'x-labels')
    }
  }
}
</script>

<style>

</style>
