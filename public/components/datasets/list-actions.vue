<template>
  <v-list dense class="py-0">
    <v-list-item :to="{path: '/new-dataset', query: {type: 'file'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-file-upload
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Importer un fichier</v-list-item-title>
    </v-list-item>
    <v-list-item :to="{path: '/new-dataset', query: {type: 'virtual'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-picture-in-picture-bottom-right-outline
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Créer un jeu virtuel</v-list-item-title>
    </v-list-item>
    <v-list-item :to="{path: '/new-dataset', query: {type: 'rest'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-all-inclusive
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Créer un jeu incrémental</v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script>
  export default {
  }
</script>

<style lang="css" scoped>
</style>
