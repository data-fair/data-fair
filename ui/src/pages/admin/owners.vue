<template>
  <v-container v-if="ownersFetch.data.value">
    <h2 class="text-title-large mb-4">
      {{ t('owners') }}
    </h2>

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
          :label="t('searchByName')"
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
            <span v-if="owner.consumption && (owner.consumption.storage !== undefined)">{{ parseFloat(((owner.consumption && owner.consumption.storage || 0) / 1000).toFixed(2)).toLocaleString() }} {{ t('kbStored') }}</span>
            <span v-if="owner.storage !== undefined">{{ t('forALimitOf') }} {{ parseFloat((owner.storage / 1000).toFixed(2)).toLocaleString() }} ko</span>
          </v-list-item-subtitle>
          <v-list-item-subtitle>
            <a
              :href="withQuery('/data-fair/datasets', {owner: `${owner.type}:${owner.id}`, shared: 'true'})"
              target="_top"
              class="simple-link"
            >
              {{ owner.nbDatasets }} {{ t('datasets') }}
            </a>
            -
            <a
              :href="withQuery('/data-fair/applications', {owner: `${owner.type}:${owner.id}`, shared: 'true'})"
              target="_top"
              class="simple-link"
            >
              {{ owner.nbApplications }} {{ t('applications') }}
            </a>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-sheet>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  owners: Propriétaires
  searchByName: Rechercher par le nom
  kbStored: ko stockés
  forALimitOf: pour une limite à
  datasets: jeux de données
  applications: applications
en:
  owners: Owners
  searchByName: Search by name
  kbStored: kb stored
  forALimitOf: for a limit of
  datasets: datasets
  applications: applications
</i18n>

<script setup lang="ts">
import { withQuery } from 'ufo'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('owners') }] })

const q = ref('')
const ownersFetch = useFetch<{ results: any[] }>($apiPath + '/admin/owners', {
  query: computed(() => ({ size: 1000, q: q.value })), watch: false
})
ownersFetch.refresh()

</script>

<style lang="css">
</style>
