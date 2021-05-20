<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="$set(property, 'x-capabilities', property['x-capabilities'] || {})"
  >
    <template #activator="{on, attrs}">
      <v-btn
        icon
        v-bind="attrs"
        title="configuration technique"
        absolute
        right
        v-on="on"
      >
        <v-icon>mdi-tune</v-icon>
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title>Configuration technique</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3 pb-0">
        <tutorial-alert id="capabilities">
          Par défaut toutes les options sont cochées pour maximiser les utilisations possibles de vos jeux de données. Pour de petits volumes il n'y a pas d'inconvénient à conserver ce paramétrage.
          Mais pour des volumes importants désactiver les options inutiles permet de réduire les temps de traitement et de requêtes.
        </tutorial-alert>
        <tutorial-alert id="capabilities-energy">
          Qui dit temps de traitement dit énergie. En désactivant les options inutiles vous contribuez à rendre cette plateforme moins énergivore.
        </tutorial-alert>

        <v-form ref="form">
          <v-jsf
            v-if="property['x-capabilities']"
            v-model="property['x-capabilities']"
            :schema="schema"
            :options="{context}"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import '@koumoul/vjsf/lib/deps/third-party.js'

  const capabilitiesSchema = require('~/../contract/capabilities.js')
  export default {
    components: { VJsf },
    props: ['editable', 'property'],
    data() {
      return {
        dialog: false,
      }
    },
    computed: {
      schema() {
        return JSON.parse(JSON.stringify(capabilitiesSchema))
      },
      context() {
        return {}
      },
    },
  }
</script>

<style>

</style>
