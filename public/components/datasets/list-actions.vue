<template>
  <v-list dense class="list-actions">
    <v-subheader>
      CRÉER UN JEU DE DONNÉES
    </v-subheader>
    <v-list-item :to="{path: '/new-dataset', query: {type: 'file'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-file-upload
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Fichier</v-list-item-title>
    </v-list-item>
    <v-list-item :to="{path: '/new-dataset', query: {type: 'virtual'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-picture-in-picture-bottom-right-outline
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Virtuel</v-list-item-title>
    </v-list-item>
    <v-list-item :to="{path: '/new-dataset', query: {type: 'rest'}}">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-all-inclusive
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>Incrémental</v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script>
  export default {
  }
</script>

<style lang="css" scoped>
</style>
