<template>
  <v-list
    v-if="canContrib"
    dense
    class="list-actions"
  >
    <v-subheader v-t="'createDataset'" />
    <v-tooltip left>
      <template v-slot:activator="{ on, attrs }">
        <v-list-item
          :to="{path: '/new-dataset', query: {type: 'file'}}"
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon color="primary">
              mdi-file-upload
            </v-icon>
          </v-list-item-icon>
          <v-list-item-title v-t="'file'" />
        </v-list-item>
      </template>
      <span v-t="'fileTooltip'" />
    </v-tooltip>
    <v-tooltip left>
      <template v-slot:activator="{ on, attrs }">
        <v-list-item
          :to="{path: '/new-dataset', query: {type: 'rest'}}"
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon color="primary">
              mdi-all-inclusive
            </v-icon>
          </v-list-item-icon>
          <v-list-item-title v-t="'inc'" />
        </v-list-item>
      </template>
      <span v-t="'incTooltip'" />
    </v-tooltip>
    <v-tooltip left>
      <template v-slot:activator="{ on, attrs }">
        <v-list-item
          :to="{path: '/new-dataset', query: {type: 'virtual'}}"
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon color="primary">
              mdi-picture-in-picture-bottom-right-outline
            </v-icon>
          </v-list-item-icon>
          <v-list-item-title v-t="'virtual'" />
        </v-list-item>
      </template>
      <span v-t="'virtualTooltip'" />
    </v-tooltip>
    <v-tooltip left>
      <template v-slot:activator="{ on, attrs }">
        <v-list-item
          :to="{path: '/new-dataset', query: {type: 'metaOnly'}}"
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon color="primary">
              mdi-information-variant
            </v-icon>
          </v-list-item-icon>
          <v-list-item-title v-t="'metaOnly'" />
        </v-list-item>
      </template>
      <span v-t="'metaOnlyTooltip'" />
    </v-tooltip>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  createDataset: CRÉER UN JEU DE DONNÉES
  file: Fichier
  fileTooltip: Chargez un fichier parmi les nombreux formats supportés.
  inc: Incrémental
  incTooltip: Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.
  virtual: Virtuel
  virtualTooltip: Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.
  metaOnly: Métadonnées seules
  metaOnlyTooltip: Créez un pseudo jeu de données sans donnée locales, uniquement les autres informations, pièces jointes, etc.
en:
  createDataset: CREATE A DATASET
  file: File
  fileTooltip: Load a file among the many supported formats.
  inc: Incremental
  incTooltip: Create a dataset whose content will be writable directly through a form.
  virtual: Virtual
  virtualTooltip: Create a restricted virtual vue over one or more datasets.
  metaOnly: Metadata only
  metaOnlyTooltip: Create a pseudo dataset without any local data, only other information, attachments, etc.
</i18n>

<script>
  const { mapGetters } = require('vuex')

  export default {
    computed: {
      ...mapGetters(['canContrib']),
    },
  }
</script>

<style lang="css" scoped>
</style>
