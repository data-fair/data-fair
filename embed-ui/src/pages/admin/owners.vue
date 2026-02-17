<template lang="html">
  <v-container>
    <h2 class="text-h6 mb-4">
      Propriétaires
    </h2>

    <v-row v-if="ownersFetch.data.value">
      <v-col>
        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-text-field
              v-model="q"
              name="q"
              label="Rechercher par le nom"
              @keypress.enter="ownersFetch.refresh()"
            />
          </v-col>
        </v-row>
        <v-sheet v-if="ownersFetch.data.value.results.length">
          <v-list lines="three">
            <v-list-item
              v-for="owner in ownersFetch.data.value.results"
              :key="owner.id"
            >
              <v-list-item-title>
                {{ owner.name || owner.id }} ({{ owner.type }})
              </v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="owner.consumption && (owner.consumption.storage !== undefined)">{{ parseFloat(((owner.consumption && owner.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} ko stockés</span>
                <span v-if="owner.storage !== undefined">pour une limite à {{ parseFloat((owner.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
              </v-list-item-subtitle>
              <v-list-item-subtitle>
                <a
                  :href="withQuery('/data-fair/datasets', {'ownerExt': `${owner.type}:${owner.id}`, shared: 'true'})"
                  target="_top"
                  class="simple-link"
                >
                  {{ owner.nbDatasets }} jeux de données
                </a>
                -
                <a
                  :href="withQuery('/data-fair/applications', {'ownerExt': `${owner.type}:${owner.id}`, shared: 'true'})"
                  target="_top"
                  class="simple-link"
                >
                  {{ owner.nbApplications }} applications
                </a>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-sheet>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { withQuery } from 'ufo'

const q = ref('')
const ownersFetch = useFetch<{ results: any[] }>($apiPath + '/admin/owners', {
  query: computed(() => ({ size: 1000, q: q.value })), watch: false
})
ownersFetch.refresh()

</script>

<style lang="css">
</style>
