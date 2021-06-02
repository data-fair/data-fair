<template>
  <v-dialog
    v-model="dialog"
    :fullscreen="$vuetify.breakpoint.smAndDown"
    max-width="1200"
  >
    <template v-slot:activator="{ on }">
      <v-icon
        title="Prévisualiser la donnée"
        v-on="on"
      >
        mdi-table
      </v-icon>
    </template>
    <v-card v-if="dialog">
      <v-toolbar dense flat>
        <v-toolbar-title class="font-weight-bold">
          {{ dataset.title }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon @click.native="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="pl-4 pr-4 pb-4">
        <dataset-table v-if="$store.state.dataset.dataset" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
  export default {
    props: ['dataset'],
    data: () => ({
      dialog: false,
    }),
    watch: {
      dialog() {
        if (this.dialog) this.$store.dispatch('dataset/setId', { datasetId: this.dataset.id })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
