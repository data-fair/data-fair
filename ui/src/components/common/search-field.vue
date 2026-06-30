<template>
  <div
    :aria-label="t('search')"
    role="search"
    class="mx-2 flex-1-1"
    style="max-width: 250px; min-width: 175px;"
  >
    <v-text-field
      v-model="pendingQ"
      :label="t('search')"
      color="primary"
      density="compact"
      variant="outlined"
      hide-details
      single-line
      clearable
      rounded
      @keyup.enter="q = pendingQ"
      @click:clear="q = ''"
    >
      <template #append-inner>
        <v-btn
          :icon="mdiMagnify"
          :title="t('searchSubmit')"
          density="comfortable"
          size="small"
          variant="text"
          @click="q = pendingQ"
        />
      </template>
    </v-text-field>
  </div>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  searchSubmit: Lancer la recherche
en:
  search: Search
  searchSubmit: Submit search
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'

const { immediate } = defineProps<{ immediate?: boolean }>()

const { t } = useI18n()
const q = defineModel<string>({ default: '' })

/** Local buffer holding the in-progress input. Acts as a manual debounce: the parent model is
 *  only updated on Enter or magnifier click, unless `immediate` is set. */
const pendingQ = ref('')
watch(q, () => { pendingQ.value = q.value }, { immediate: true })
watch(pendingQ, () => { if (immediate) q.value = pendingQ.value })
</script>
