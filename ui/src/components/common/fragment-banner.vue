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
    <!-- a dataset fragment is not one of its virtual parent's sources until the user judges it ready -->
    <div
      v-if="notSourceYet"
      class="d-flex align-center flex-wrap ga-2 mt-1"
    >
      {{ t('notSource') }}
      <v-btn
        v-if="canAddSource"
        :prepend-icon="mdiPlus"
        :loading="addToSources.loading.value"
        size="small"
        color="primary"
        variant="text"
        @click="addToSources.execute()"
      >
        {{ t('addSource') }}
      </v-btn>
    </div>
  </v-alert>
</template>

<i18n lang="yaml">
fr:
  fragmentOf: "Cette ressource est un fragment de :"
  notSource: Ce jeu de données n'est pas encore une source du jeu de données parent.
  addSource: Ajouter aux sources
  addedToSources: Le jeu de données a été ajouté aux sources du jeu de données parent.
en:
  fragmentOf: "This resource is a fragment of:"
  notSource: This dataset is not a source of the parent dataset yet.
  addSource: Add to the sources
  addedToSources: The dataset was added to the sources of the parent dataset.
</i18n>

<script setup lang="ts">
import { mdiPlus, mdiPuzzle } from '@mdi/js'

const { partOf, fragment } = defineProps<{
  partOf: { type: 'dataset' | 'application', id: string },
  // the dataset fragment whose page shows the banner, to tell whether it is a source of its virtual parent
  fragment?: { id: string, status?: string }
}>()
const { t } = useI18n()
// notifError: false — a user who can write the fragment does not necessarily hold readDescription
// on the parent (the derived ACL grants management on the fragment, not read on the parent), so a
// 403/404 here is an ordinary case: fall back to showing the parent id instead of toasting an error
const parentFetch = useFetch<{ title: string, isVirtual?: boolean, virtual?: { children?: string[] }, userPermissions?: string[] }>(`${$apiPath}/${partOf.type}s/${partOf.id}`, { query: { select: 'title,isVirtual,virtual' }, notifError: false })

const notSourceYet = computed(() => {
  const parent = parentFetch.data.value
  return !!fragment && !!parent?.isVirtual && !(parent.virtual?.children ?? []).includes(fragment.id)
})
const canAddSource = computed(() => fragment?.status === 'finalized' && !!parentFetch.data.value?.userPermissions?.includes('writeDescriptionBreaking'))

const addToSources = useAsyncAction(async () => {
  const virtual = parentFetch.data.value?.virtual ?? {}
  await $fetch(`datasets/${partOf.id}`, { method: 'PATCH', body: { virtual: { ...virtual, children: [...(virtual.children ?? []), fragment!.id] } } })
  await parentFetch.refresh()
}, { success: t('addedToSources') })
</script>
