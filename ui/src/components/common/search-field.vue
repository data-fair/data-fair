<template>
  <form
    role="search"
    :aria-label="t('search')"
    class="search-field-form mx-2"
    @submit.prevent="q = pendingQ"
  >
    <v-text-field
      v-model="pendingQ"
      :label="t('search')"
      color="primary"
      density="compact"
      max-width="250"
      min-width="175"
      variant="outlined"
      hide-details
      single-line
      clearable
      rounded
      @click:clear="q = ''"
    >
      <template #append-inner>
        <v-btn
          :icon="mdiMagnify"
          :aria-label="t('searchSubmit')"
          :title="t('searchSubmit')"
          density="comfortable"
          size="small"
          variant="text"
          @click="q = pendingQ"
        />
      </template>
    </v-text-field>
  </form>
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
 *  only updated on form submit (Enter or magnifier click), unless `immediate` is set. */
const pendingQ = ref('')
watch(q, () => { pendingQ.value = q.value }, { immediate: true })
watch(pendingQ, () => { if (immediate) q.value = pendingQ.value })
</script>

<style scoped>
.search-field-form {
  display: inline-flex;
  align-items: center;
}
</style>
