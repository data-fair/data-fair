<template>
  <v-alert
    type="info"
    variant="tonal"
    density="compact"
    class="mb-4"
    :icon="mdiPuzzle"
  >
    {{ t('fragmentOf') }}
    <router-link :to="`/${partOf.type}/${partOf.id}`">
      {{ parentFetch.data.value?.title ?? partOf.id }}
    </router-link>
  </v-alert>
</template>

<i18n lang="yaml">
fr:
  fragmentOf: "Cette ressource est un fragment de :"
en:
  fragmentOf: "This resource is a fragment of:"
</i18n>

<script setup lang="ts">
import { mdiPuzzle } from '@mdi/js'

const { partOf } = defineProps<{ partOf: { type: 'dataset' | 'application', id: string } }>()
const { t } = useI18n()
// notifError: false — a user who can write the fragment does not necessarily hold readDescription
// on the parent (the derived ACL grants management on the fragment, not read on the parent), so a
// 403/404 here is an ordinary case: fall back to showing the parent id instead of toasting an error
const parentFetch = useFetch<{ title: string }>(`${$apiPath}/${partOf.type}s/${partOf.id}`, { query: { select: 'title' }, notifError: false })
</script>
