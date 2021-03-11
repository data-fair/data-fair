<template>
  <v-form>
    <p class="mb-6">
      Les vignettes sont utilisées par les visualisations pour afficher les images du jeu de données de manière performante et en les adaptant aux dimensions souhaitées.
    </p>
    <v-select
      v-model="editThumbnails.resizeMode"
      style="max-width: 300px;"
      label="Mode de redimensionnement"
      dense
      hide-details
      :items="[{text: 'Rogner', value: 'crop'}, {text: 'Ne pas rogner', value: 'fitIn'}, {text: 'Rogner en analysant le contenu des images', value: 'smartCrop'}]"
      @change="patchAndCommit({ thumbnails: editThumbnails })"
    />
  </v-form>
</template>

<script>
  const { mapState, mapActions } = require('vuex')

  export default {
    data: () => ({
      editThumbnails: null,
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
    },
    watch: {
      'dataset.thumbnails': {
        immediate: true,
        handler() {
          this.editThumbnails = JSON.parse(JSON.stringify(this.dataset.thumbnails || {}))
        },
      },
    },
    methods: {
      ...mapActions('dataset', ['patchAndCommit']),
    },
  }
</script>

<style lang="css" scoped>
</style>
