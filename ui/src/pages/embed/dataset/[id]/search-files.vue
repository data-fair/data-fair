<template>
  <v-container
    :style="`height: ${windowHeight}px`"
    class="pa-0"
    fluid
  >
    <dataset-search-files
      v-if="digitalDocumentField"
      v-model:q="q"
      :height="windowHeight"
    />
    <v-alert
      v-else-if="dataset"
      type="info"
      class="ma-4"
      :text="t('unavailable')"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  unavailable: Ce jeu de données n'a pas de colonne de documents numériques.
en:
  unavailable: This dataset has no digital document column.
</i18n>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'

const { t } = useI18n()
const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/search-files'>()
const draft = useBooleanSearchParam('draft')

const { dataset, digitalDocumentField } = provideDatasetStore(route.params.id, draft.value ?? undefined, true)

const q = useStringSearchParam('q')
</script>
