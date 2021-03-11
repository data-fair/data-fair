<template>
  <v-list dense class="list-actions">
    <v-subheader>
      CRÉER UN JEU DE DONNÉES
    </v-subheader>
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
          <v-list-item-title>Fichier</v-list-item-title>
        </v-list-item>
      </template>
      <span>Chargez un fichier parmi les nombreux formats supportés.</span>
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
          <v-list-item-title>Incrémental</v-list-item-title>
        </v-list-item>
      </template>
      <span>Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.</span>
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
          <v-list-item-title>Virtuel</v-list-item-title>
        </v-list-item>
      </template>
      <span>Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.</span>
    </v-tooltip>
  </v-list>
</template>

<script>
  export default {
  }
</script>

<style lang="css" scoped>
</style>
