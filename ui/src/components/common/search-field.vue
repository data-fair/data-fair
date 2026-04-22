<template>
  <v-text-field
    v-model="pendingQ"
    :append-inner-icon="mdiMagnify"
    :label="t('search')"
    class="mx-2"
    color="primary"
    density="compact"
    max-width="250"
    min-width="175"
    variant="outlined"
    hide-details
    single-line
    clearable
    rounded
    @keyup.enter="q = pendingQ"
    @click:append-inner="q = pendingQ"
    @click:clear="q = ''"
  />
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
en:
  search: Search
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'

const { immediate } = defineProps<{ immediate?: boolean }>()

const { t } = useI18n()
const q = defineModel<string>({ default: '' })

/** Local buffer holding the in-progress input. Acts as a manual debounce: the parent model is
 *  only updated on Enter or icon click, unless `immediate` is set. */
const pendingQ = ref('')
watch(q, () => { pendingQ.value = q.value }, { immediate: true })
watch(pendingQ, () => { if (immediate) q.value = pendingQ.value })
</script>
