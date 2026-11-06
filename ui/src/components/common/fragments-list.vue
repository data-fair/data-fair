<template>
  <div>
    <div
      v-if="canCreateDataset || canCreateApplication || hasFragments"
      class="d-flex align-center flex-wrap ga-2 mb-4"
    >
      <v-btn
        v-if="canCreateDataset"
        :to="`/new-dataset?partOf=${partOf.type}:${partOf.id}`"
        :prepend-icon="mdiPlus"
        color="primary"
        variant="flat"
      >
        {{ t('newDatasetFragment') }}
      </v-btn>
      <v-btn
        v-if="canCreateApplication"
        :to="`/new-application?partOf=${partOf.type}:${partOf.id}`"
        :prepend-icon="mdiPlus"
        color="primary"
        variant="flat"
      >
        {{ t('newApplicationFragment') }}
      </v-btn>
      <view-mode-toggle
        v-if="hasFragments"
        v-model="viewMode"
        class="ml-auto"
      />
    </div>
    <p v-if="!hasFragments">
      {{ t('noFragments') }}
    </p>
    <v-row v-else-if="viewMode === 'grid'">
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
        <fragment-source-status
          v-if="sources"
          v-bind="sourceStatus(dataset)"
          class="mt-2"
          @add="emit('addSource', dataset.id)"
        />
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
    <v-list
      v-else
      lines="two"
    >
      <!-- the source status stays outside of the item: its button would sit inside the item's link -->
      <div
        v-for="dataset in fragments.datasets"
        :key="dataset.id"
        class="d-flex align-center flex-wrap"
      >
        <dataset-list-item
          :dataset="dataset"
          style="flex: 1 1 240px; min-width: 0;"
        />
        <fragment-source-status
          v-if="sources"
          v-bind="sourceStatus(dataset)"
          class="flex-shrink-0 mx-2"
          @add="emit('addSource', dataset.id)"
        />
      </div>
      <application-list-item
        v-for="application in fragments.applications"
        :key="application.id"
        :application="application"
      />
    </v-list>
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
en:
  newDatasetFragment: New dataset fragment
  newApplicationFragment: New application fragment
  noFragments: No fragment.
  loadMore: Show more fragments
</i18n>

<script setup lang="ts">
import type { ViewMode } from '~/composables/use-view-mode'
import { mdiPlus } from '@mdi/js'
import { usePermissions } from '~/composables/use-permissions'

const props = defineProps<{
  partOf: { type: 'dataset' | 'application', id: string },
  fragments: { datasets: any[], applications: any[] },
  hasMore?: boolean
  // the children of a virtual parent, null for any other parent
  sources?: string[] | null
  canAddSource?: boolean
  addingSource?: string | null
  // a sub-application declares what it grants on the parent's dataset fragments: the API requires
  // writeConfig on the parent application to create one
  canWriteParentConfig?: boolean
  // the parent's base app declares that it embeds other applications (df:use-apps meta, typically a
  // dashboard): only then is creating a sub-application offered
  usesApps?: boolean
}>()
const emit = defineEmits<{ loadMore: [], addSource: [id: string] }>()
const { t } = useI18n()
const { canContribDep } = usePermissions()

const canCreateDataset = computed(() => canContribDep.value && props.partOf.type === 'dataset')
const canCreateApplication = computed(() => canContribDep.value && props.partOf.type === 'application' && props.canWriteParentConfig && props.usesApps)
const viewMode = ref<ViewMode>('grid')
const hasFragments = computed(() => !!(props.fragments.datasets.length || props.fragments.applications.length))
const sourceStatus = (dataset: { id: string, status?: string }) => ({
  isSource: !!props.sources?.includes(dataset.id),
  canAdd: !!props.canAddSource && dataset.status === 'finalized',
  adding: props.addingSource === dataset.id,
  addDisabled: !!props.addingSource
})
</script>
