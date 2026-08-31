<template>
  <!-- live region: the count is the answer to the question the scope asks, and it changes
       on every scope change — same pattern as portals' catalog-layout.vue. No heading tag:
       this is not a section title. -->
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    class="text-title-large mb-4"
  >
    {{ t('matchingCount', catalog.totalCount.value) }}
  </div>

  <v-row class="d-flex align-stretch">
    <v-col
      v-for="item in catalog.displayedItems.value"
      :key="item.id"
      cols="12"
      sm="6"
      md="4"
    >
      <dataset-card
        v-if="resourceType === 'datasets'"
        :dataset="(item as any)"
      >
        <permission-access-chips
          v-if="scope && account"
          :sources="sourcesOf(item)"
          :account-id="account.id"
        />
      </dataset-card>
      <application-card
        v-else
        :application="(item as any)"
      >
        <permission-access-chips
          v-if="scope && account"
          :sources="sourcesOf(item)"
          :account-id="account.id"
        />
      </application-card>
    </v-col>
  </v-row>

  <!-- Infinite scroll sentinel, same shape as ui/src/pages/datasets/index.vue:87-91 -->
  <div
    v-if="catalog.hasMore.value && !catalog.loading.value"
    v-intersect="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
  />
</template>

<i18n lang="yaml">
fr:
  matchingCount: "Aucune ressource correspondante | 1 ressource correspondante | {count} ressources correspondantes"
en:
  matchingCount: "No matching resource | 1 matching resource | {count} matching resources"
</i18n>

<script setup lang="ts">
import DatasetCard from '~/components/dataset/dataset-card.vue'
import ApplicationCard from '~/components/application/application-card.vue'
import PermissionAccessChips from './permission-access-chips.vue'
import { effectiveAccess, type AccessResource } from '@data-fair/data-fair-shared/permissions/effective-access.ts'
import { scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  scope: PermissionScope | null
}>()

const { t } = useI18n()

// $uiConfig and $sdUrl are auto-imported from ~/context (ui/vite.config.ts), do not import them
const { account } = useSession()

// the list says which resources, this says why: same permission entries, evaluated by the
// mirror of matchPermission that shared/permissions/effective-access.ts holds
const sourcesOf = (item: any) => {
  if (!props.scope || !account.value) return []
  return effectiveAccess(props.scope, item as AccessResource, account.value, $uiConfig.adminRole)
}

const query = computed(() => ({
  // copied verbatim from ui/src/pages/datasets/index.vue:262 and
  // ui/src/pages/applications/index.vue:252, so the cards get exactly the fields they
  // already rely on there
  select: props.resourceType === 'datasets'
    ? 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft.file,draft.originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason,integrity'
    : 'title,description,status,updatedAt,publicationSites,topics,visibility,owner,url',
  ...scopeToParams(props.scope)
}))

const catalog = useCatalogList<{ id: string, owner: any, permissions?: any[] }>({
  fetchUrl: computed(() => `${$apiPath}/${props.resourceType}`),
  query,
  facetsFields: '',
})
</script>
