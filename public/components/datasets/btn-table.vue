<template>
  <v-dialog
    v-model="dialog"
    :fullscreen="$vuetify.breakpoint.smAndDown"
  >
    <template v-slot:activator="{ on }">
      <v-btn
        icon
        title="Prévisualisez la donnée"
        v-on="on"
      >
        <v-icon>mdi-table</v-icon>
      </v-btn>
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
  import DatasetTable from '~/components/datasets/table.vue'
  export default {
    components: { DatasetTable },
    props: ['dataset'],
    data: () => ({
      dialog: false,
    }),
    watch: {
      dialog() {
        if (this.dialog) this.$store.dispatch('dataset/setId', this.dataset.id)
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
