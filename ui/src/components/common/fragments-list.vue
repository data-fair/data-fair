<template>
  <div>
    <v-btn
      v-if="canContribDep"
      :to="`/new-dataset?partOf=${partOf.type}:${partOf.id}`"
      :prepend-icon="mdiPlus"
      class="mb-4 mr-2"
      color="primary"
      variant="flat"
    >
      {{ t('newDatasetFragment') }}
    </v-btn>
    <v-btn
      v-if="canContribDep && partOf.type === 'application'"
      :to="`/new-application?partOf=${partOf.type}:${partOf.id}`"
      :prepend-icon="mdiPlus"
      class="mb-4"
      color="primary"
      variant="flat"
    >
      {{ t('newApplicationFragment') }}
    </v-btn>
    <v-row v-if="fragments.datasets.length || fragments.applications.length">
      <v-col
        v-for="dataset in fragments.datasets"
        :key="dataset.id"
        cols="12"
        sm="6"
        md="4"
      >
        <dataset-card :dataset="dataset" />
      </v-col>
      <v-col
        v-for="application in fragments.applications"
        :key="application.id"
        cols="12"
        sm="6"
        md="4"
      >
        <application-card :application="application" />
      </v-col>
    </v-row>
    <p v-else>
      {{ t('noFragments') }}
    </p>
  </div>
</template>

<i18n lang="yaml">
fr:
  newDatasetFragment: Nouveau jeu de données fragment
  newApplicationFragment: Nouvelle application fragment
  noFragments: Aucun fragment.
en:
  newDatasetFragment: New dataset fragment
  newApplicationFragment: New application fragment
  noFragments: No fragment.
</i18n>

<script setup lang="ts">
import { mdiPlus } from '@mdi/js'
import { usePermissions } from '~/composables/use-permissions'

defineProps<{
  partOf: { type: 'dataset' | 'application', id: string },
  fragments: { datasets: any[], applications: any[] }
}>()
const { t } = useI18n()
const { canContribDep } = usePermissions()
</script>
