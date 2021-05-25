<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="toggle"
  >
    <template #activator="{on, attrs}">
      <v-btn
        v-if="user.adminMode"
        fab
        small
        depressed
        color="admin"
        dark
        v-bind="attrs"
        title="libellés"
        absolute
        style="right:60px;"
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
        <v-toolbar-title>Libellés</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <tutorial-alert id="labels">
          Saisissez des libellés associés à des valeurs présentes dans la donnée pour améliorer la présentation dans les visualisations.
        </tutorial-alert>

        <v-form ref="form">
          <v-jsf
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

<script>
  import { mapState } from 'vuex'
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import '@koumoul/vjsf/lib/deps/third-party.js'

  const schema = {
    type: 'array',
    title: ' ',
    items: {
      type: 'object',
      properties: {
        value: { type: 'string', title: 'valeur', 'x-cols': 6 },
        label: { type: 'string', title: 'libellé', 'x-cols': 6 },
      },
    },
  }
  export default {
    components: { VJsf },
    props: ['editable', 'property'],
    data() {
      return {
        dialog: false,
        editLabels: null,
        schema,
      }
    },
    computed: {
      ...mapState('session', ['user']),
    },
    methods: {
      toggle(show) {
        if (show) {
          this.editLabels = Object.keys(this.property['x-labels'] || {})
            .map(key => ({ value: key, label: this.property['x-labels'][key] }))
        } else {
          this.editLabels = null
        }
      },
      apply() {
        const labels = this.editLabels.reduce((a, item) => { a[item.value] = item.label; return a }, {})
        if (Object.keys(labels).length) this.$set(this.property, 'x-labels', labels)
        else delete this.property['x-labels']
      },
    },
  }
</script>

<style>

</style>
