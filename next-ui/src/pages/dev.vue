<template>
  <v-container>
    <h2 class="text-h4 mb-4">
      Data Fair dev
    </h2>

    <v-row>
      <v-col>
        <v-list>
          <v-list-subheader>Datasets</v-list-subheader>
          <v-skeleton-loader
            v-if="datasetsFetch.loading.value"
            type="list-item"
          />
          <template v-else-if="datasetsFetch.data.value">
            <v-list-item
              v-for="dataset in datasetsFetch.data.value.results"
              :key="dataset.id"
            >
              <v-list-item-title>{{ dataset.title }} ({{ dataset.slug }} / {{ dataset.id }})</v-list-item-title>
              <template #append>
                <v-btn
                  :icon="mdiViewList"
                  :to="`/embed/dataset/${dataset.id}/fields`"
                  variant="flat"
                />
                <v-btn
                  :icon="mdiTable"
                  :to="`/embed/dataset/${dataset.id}/table`"
                  variant="flat"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-col>
      <v-col>
        <v-list>
          <v-list-subheader>Applications</v-list-subheader>
          <v-skeleton-loader
            v-if="appsFetch.loading.value"
            type="list-item"
          />
          <template v-else-if="appsFetch.data.value">
            <v-list-item
              v-for="app in appsFetch.data.value.results"
              :key="app.id"
            >
              <v-list-item-title>{{ app.title }} ({{ app.slug }} / {{ app.id }})</v-list-item-title>
              <template #append>
                <v-btn
                  :icon="mdiPencil"
                  :to="`/embed/application/${app.id}/config`"
                  variant="flat"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-col>
    </v-row>

    <v-row>
      <v-col>
        <v-list>
          <v-list-subheader>Settings</v-list-subheader>
          <v-list-item
            :to="`/embed/settings/${session.state.account.type}/${session.state.account.id}/api-keys`"
          >
            <v-list-item-title>API Keys</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { mdiTable, mdiPencil, mdiViewList } from '@mdi/js'

const datasetsFetch = useFetch<{ count: number, results: any[] }>($apiPath + '/datasets', { query: { size: 10000 } })
const appsFetch = useFetch<{ count: number, results: any[] }>($apiPath + '/applications', { query: { size: 10000 } })
const session = useSessionAuthenticated()
</script>

<style>
</style>
