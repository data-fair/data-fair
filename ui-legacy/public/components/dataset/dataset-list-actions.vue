<template>
  <v-list
    v-if="canContribDep"
    dense
    class="list-actions"
  >
    <v-list-item to="/new-dataset">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-plus-circle
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'createDataset'" />
    </v-list-item>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  createDataset: Créer un jeu de données
en:
  createDataset: Create a dataset
</i18n>

<script>
const { mapGetters } = require('vuex')

export default {
  computed: {
    ...mapGetters(['canContribDep'])
  }
}
</script>

<style lang="css" scoped>
</style>
