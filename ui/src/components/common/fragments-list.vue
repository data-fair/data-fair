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
        class="d-flex flex-column"
      >
        <dataset-card
          :dataset="dataset"
          class="flex-grow-1"
        />
        <!-- a virtual parent: whether the fragment is one of its sources, adding it is an explicit step -->
        <div
          v-if="sources"
          class="d-flex align-center flex-wrap ga-2 mt-2"
        >
          <v-chip
            v-if="sources.includes(dataset.id)"
            :prepend-icon="mdiCheck"
            color="success"
            size="small"
            variant="tonal"
          >
            {{ t('isSource') }}
          </v-chip>
          <template v-else>
            <v-chip
              size="small"
              variant="tonal"
            >
              {{ t('notSource') }}
            </v-chip>
            <v-btn
              v-if="canAddSource && dataset.status === 'finalized'"
              :prepend-icon="mdiPlus"
              :loading="addingSource === dataset.id"
              :disabled="!!addingSource"
              size="small"
              color="primary"
              variant="text"
              @click="emit('addSource', dataset.id)"
            >
              {{ t('addSource') }}
            </v-btn>
          </template>
        </div>
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
    <v-btn
      v-if="hasMore"
      class="mt-4"
      variant="text"
      color="primary"
      @click="emit('loadMore')"
    >
      {{ t('loadMore') }}
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  newDatasetFragment: Nouveau jeu de données fragment
  newApplicationFragment: Nouvelle application fragment
  noFragments: Aucun fragment.
  loadMore: Voir plus de fragments
  isSource: Source du jeu de données
  notSource: Pas encore une source
  addSource: Ajouter aux sources
en:
  newDatasetFragment: New dataset fragment
  newApplicationFragment: New application fragment
  noFragments: No fragment.
  loadMore: Show more fragments
  isSource: Source of the dataset
  notSource: Not a source yet
  addSource: Add to the sources
</i18n>

<script setup lang="ts">
import { mdiCheck, mdiPlus } from '@mdi/js'
import { usePermissions } from '~/composables/use-permissions'

defineProps<{
  partOf: { type: 'dataset' | 'application', id: string },
  fragments: { datasets: any[], applications: any[] },
  hasMore?: boolean
  // the children of a virtual parent, null for any other parent
  sources?: string[] | null
  canAddSource?: boolean
  addingSource?: string | null
}>()
const emit = defineEmits<{ loadMore: [], addSource: [id: string] }>()
const { t } = useI18n()
const { canContribDep } = usePermissions()
</script>
