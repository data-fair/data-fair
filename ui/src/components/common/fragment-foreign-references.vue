<template>
  <v-alert
    v-if="foreign.length"
    type="warning"
    variant="outlined"
    class="mt-4"
  >
    <p>{{ t('intro.' + resourceType) }}</p>
    <ul class="ml-5 my-2">
      <li
        v-for="ref in foreign"
        :key="ref.type + ':' + ref.id"
      >
        <router-link :to="`/${ref.type}/${ref.id}`">
          {{ ref.title || ref.id }}
        </router-link>
      </li>
    </ul>
    <p>{{ t('consequences.' + resourceType) }}</p>
  </v-alert>
</template>

<i18n lang="yaml">
fr:
  intro:
    dataset: "Ce jeu de données fragment est aussi utilisé en dehors de son parent :"
    application: "Cette application fragment est aussi utilisée en dehors de son parent :"
  consequences:
    dataset: "Ses accès découlent uniquement de son parent et il sera supprimé avec lui : ces autres usages risquent d'être cassés. Détachez-le pour en faire un jeu de données autonome, ou retirez-le de ces ressources."
    application: "Ses accès découlent uniquement de son parent et elle sera supprimée avec lui : ces autres usages risquent d'être cassés. Détachez-la pour en faire une application autonome, ou retirez-la de ces ressources."
en:
  intro:
    dataset: "This dataset fragment is also used outside of its parent:"
    application: "This application fragment is also used outside of its parent:"
  consequences:
    dataset: "Its access derives from its parent only and it will be deleted with it: these other uses may break. Detach it to make it a standalone dataset, or remove it from these resources."
    application: "Its access derives from its parent only and it will be deleted with it: these other uses may break. Detach it to make it a standalone application, or remove it from these resources."
</i18n>

<script setup lang="ts">
import { foreignReferences, type ReferencingResource } from '~/utils/fragments'

const { resourceType, resourceId, partOf } = defineProps<{
  resourceType: 'dataset' | 'application',
  resourceId: string,
  partOf: { type: 'dataset' | 'application', id: string }
}>()
const { t } = useI18n()

// the API does not check who references a fragment (fragments.md §3), an agent or a raw API call can
// end up embedding it elsewhere: list its users here, the pinning params bypass the default fragment hiding
type RefsResponse = { count: number, results: { id: string, title?: string, partOf?: ReferencingResource['partOf'] }[] }
// a single page: a fragment used by more than 100 resources is not a case worth paging for
const size = 100
const appsFetch = useFetch<RefsResponse>(`${$apiPath}/applications`, {
  query: { [resourceType]: resourceId, size, select: 'id,title,partOf,-links' }
})
const virtualsFetch = useFetch<RefsResponse>(() => resourceType === 'dataset' ? `${$apiPath}/datasets` : null, {
  query: { children: resourceId, size, select: 'id,title,partOf,-userPermissions,-links' }
})

const refs = computed<ReferencingResource[]>(() => [
  ...(appsFetch.data.value?.results ?? []).map(r => ({ ...r, type: 'application' as const })),
  ...(virtualsFetch.data.value?.results ?? []).map(r => ({ ...r, type: 'dataset' as const }))
])
const foreign = computed(() => foreignReferences(partOf, refs.value))
</script>
