<template lang="html">
  <v-row class="my-0">
    <v-col :style="display.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <p v-if="datasetsErrorsFetch.data.value?.count === 0">
          Aucun jeu de données en erreur
        </p>
        <template v-else-if="datasetsErrorsFetch.data.value">
          <h3 class="text-h6">
            Jeux de données en erreur
          </h3>
          <v-sheet
            class="my-4"
            style="max-height:800px; overflow-y: scroll;"
          >
            <v-list lines="two">
              <v-list-item
                v-for="error in datasetsErrorsFetch.data.value.results"
                :key="error.id"
              >
                <v-list-item-title>
                  <a
                    :href="`/data-fair/dataset/${error.id}`"
                    target="_top"
                    class="simple-link"
                  >
                    {{ error.title }} ({{ error.owner.name }})
                  </a>
                </v-list-item-title>
                <v-list-item-subtitle>{{ error.event.data }} ({{ dayjs(error.event.date).format("lll") }})</v-list-item-subtitle>

                <v-list-item-action>
                  <v-btn
                    icon
                    color="primary"
                    target="blank"
                    title="reindex"
                    @click="reindex.execute(error.id)"
                  >
                    <v-icon :icon="mdiPlay" />
                  </v-btn>
                </v-list-item-action>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>

        <p v-if="datasetsEsWarningsFetch.data.value?.count === 0">
          Aucun jeu de données avec avertissements Elasticsearch
        </p>
        <template v-else-if="datasetsEsWarningsFetch.data.value">
          <h3 class="text-h6">
            Jeux de données avec avertissements Elasticsearch
          </h3>
          <v-sheet
            class="my-4"
            style="max-height:800px; overflow-y: scroll;"
          >
            <v-list lines="two">
              <v-list-item
                v-for="error in datasetsEsWarningsFetch.data.value.results"
                :key="error.id"
              >
                <v-list-item-title>
                  <a
                    :href="`/data-fair/dataset/${error.id}`"
                    target="_top"
                    class="simple-link"
                  >
                    {{ error.title }} ({{ error.owner.name }})
                  </a>
                </v-list-item-title>
                <v-list-item-subtitle>{{ error.esWarning }}</v-list-item-subtitle>

                <v-list-item-action>
                  <v-btn
                    icon
                    color="primary"
                    target="blank"
                    title="reindex"
                    @click="reindex.execute(error.id)"
                  >
                    <v-icon :icon="mdiPlay" />
                  </v-btn>
                </v-list-item-action>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>

        <p v-if="applicationsErrorsFetch.data.value?.count === 0">
          Aucune application en erreur
        </p>
        <template v-else-if="applicationsErrorsFetch.data.value">
          <h3 class="text-h6">
            Applications en erreur
          </h3>
          <v-sheet
            class="my-4"
            style="max-height:800px; overflow-y: scroll;"
          >
            <v-list lines="two">
              <v-list-item
                v-for="error in applicationsErrorsFetch.data.value.results"
                :key="error.id"
              >
                <v-list-item-title>
                  <nuxt-link :to="`/application/${error.id}`">
                    {{ error.title }} ({{ error.owner.name }})
                  </nuxt-link>
                </v-list-item-title>
                <v-list-item-subtitle>{{ error.errorMessage }} ({{ dayjs(error.updatedAt).format("lll") }})</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>

        <p v-if="applicationsDraftErrorsFetch.data.value?.count === 0">
          Aucune application avec brouillon en erreur
        </p>
        <template v-else-if="applicationsDraftErrorsFetch.data.value">
          <h3 class="text-h6">
            Applications avec brouillon en erreur
          </h3>
          <v-sheet
            class="my-4"
            style="max-height:800px; overflow-y: scroll;"
          >
            <v-list lines="two">
              <v-list-item
                v-for="error in applicationsDraftErrorsFetch.data.value.results"
                :key="error.id"
              >
                <v-list-item-title>
                  <nuxt-link :to="`/application/${error.id}`">
                    {{ error.title }} ({{ error.owner.name }})
                  </nuxt-link>
                </v-list-item-title>
                <v-list-item-subtitle>{{ error.errorMessageDraft }} ({{ dayjs(error.updatedAt).format("lll") }})</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>
      </v-container>
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
import { mdiPlay } from '@mdi/js'
import { useDisplay } from 'vuetify/lib/composables/display.mjs'

const display = useDisplay()
const { dayjs } = useLocaleDayjs()

type ResourceErrors = {
  count: number,
  results: {
    title: string,
    id: string,
    errorMessage?: string,
    esWarning?: string,
    errorMessageDraft?: string,
    updatedAt: string
    owner: { type: string, id: string, name: string },
    event: { data: string, date: string }
  }[]
}

const datasetsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/datasets-errors', { query: { size: 1000 } })
const datasetsEsWarningsFetch = useFetch<ResourceErrors>($apiPath + '/admin/datasets-es-warnings', { query: { size: 1000 } })
const applicationsErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-errors', { query: { size: 1000 } })
const applicationsDraftErrorsFetch = useFetch<ResourceErrors>($apiPath + '/admin/applications-draft-errors', { query: { size: 1000 } })

const reindex = useAsyncAction(async (datasetId: string) => {
  await $fetch(`api/v1/datasets/${datasetId}/_reindex`, { method: 'POST' })
  datasetsErrorsFetch.refresh()
  datasetsEsWarningsFetch.refresh()
  applicationsErrorsFetch.refresh()
  applicationsDraftErrorsFetch.refresh()
})
</script>

<style lang="css">
</style>
