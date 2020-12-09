<template>
  <v-menu offset-y tile>
    <template v-slot:activator="{ on }">
      <v-btn
        color="primary"
        icon
        large
        v-on="on"
      >
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </template>
    <v-sheet>
      <v-alert
        type="info"
        :value="true"
        tile
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      >
        Ce téléchargement tient compte du tri et de la recherche
      </v-alert>
      <v-alert
        type="warning"
        :value="total > 10000"
        tile
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      >
        Les résultats sont limités aux 10 000 premières lignes
      </v-alert>
      <v-list class="pt-0" dense>
        <v-list-item :href="downloadUrls.csv" target="download">
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-file-delimited-outline
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title>format CSV</v-list-item-title>
        </v-list-item>
        <v-list-item :href="downloadUrls.xlsx" target="download">
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-microsoft-excel
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title>format XLSX</v-list-item-title>
        </v-list-item>
        <v-list-item :href="downloadUrls.ods" target="download">
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-file-table-outline
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title>format ODS</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="dataset.bbox"
          :href="downloadUrls.geojson"
          target="download"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-map
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title>Format GeoJSON</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-sheet>
  </v-menu>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import buildURL from 'axios/lib/helpers/buildURL'
  export default {
    props: ['params', 'total'],
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      downloadUrls() {
        const params = {
          ...this.params,
          size: 10000,
          page: 1,
        }
        return {
          csv: buildURL(this.resourceUrl + '/lines', { ...params, format: 'csv' }),
          xlsx: buildURL(this.resourceUrl + '/lines', { ...params, format: 'xlsx' }),
          ods: buildURL(this.resourceUrl + '/lines', { ...params, format: 'ods' }),
          geojson: buildURL(this.resourceUrl + '/lines', { ...params, format: 'geojson' }),
        }
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
