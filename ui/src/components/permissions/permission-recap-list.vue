<template>
  <v-row
    dense
    class="mb-2"
  >
    <v-col
      cols="12"
      md="8"
    >
      <v-select
        v-model="actions"
        :items="expertMode ? operationItems : classItems"
        :label="expertMode ? t('detailedActions') : t('actions')"
        multiple
        hide-details="auto"
      />
    </v-col>
    <v-col
      cols="12"
      md="4"
    >
      <v-switch
        v-model="expertMode"
        color="primary"
        :label="t('expertMode')"
        hide-details="auto"
      />
    </v-col>
  </v-row>

  <p class="text-body-2 mb-4">
    {{ t('matchingCount', catalog.totalCount.value) }}
  </p>

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
      />
      <application-card
        v-else
        :application="(item as any)"
      />
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
  actions: Actions
  detailedActions: Actions détaillées
  expertMode: Mode expert
  matchingCount: "aucune ressource correspondante | 1 ressource correspondante | {count} ressources correspondantes"
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
en:
  actions: Actions
  detailedActions: Detailed actions
  expertMode: Expert mode
  matchingCount: "no matching resource | 1 matching resource | {count} matching resources"
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
</i18n>

<script setup lang="ts">
import DatasetCard from '~/components/dataset/dataset-card.vue'
import ApplicationCard from '~/components/application/application-card.vue'
import { permissionClassesPicker } from '@data-fair/data-fair-shared/permissions/operations.ts'
import { scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  scope: PermissionScope | null
}>()

const actions = defineModel<string[]>('actions', { default: () => [] })

const { t, te, locale } = useI18n()
const expertMode = ref(false)

// No dataset context on a global screen: this is the superset of every operation, so a few
// of them only apply to REST or virtual datasets. An action that matches nothing returns
// an empty list, which is a truthful answer.
const permissionClasses = computed(() => permissionClassesPicker(props.resourceType, locale.value as 'fr' | 'en'))

const classItems = computed(() => Object.keys(permissionClasses.value)
  .filter(c => te('classNames.' + c))
  .map(c => ({ value: c, title: t('classNames.' + c) })))

const operationItems = computed(() => {
  const items: ({ type: 'subheader', title: string } | { value: string, title: string })[] = []
  for (const c of Object.keys(permissionClasses.value)) {
    if (!te('classNames.' + c)) continue
    items.push({ type: 'subheader', title: t('classNames.' + c) })
    items.push(...permissionClasses.value[c].map(op => ({ value: op.id, title: op.title })))
  }
  return items
})

// switching modes would leave incompatible values selected
watch(expertMode, () => { actions.value = [] })

const query = computed(() => {
  const params: Record<string, string> = {
    // copied verbatim from ui/src/pages/datasets/index.vue:262 and
    // ui/src/pages/applications/index.vue:252, so the cards get exactly the fields they
    // already rely on there
    select: props.resourceType === 'datasets'
      ? 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft.file,draft.originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason,integrity'
      : 'title,description,status,updatedAt,publicationSites,topics,visibility,owner,url',
    ...scopeToParams(props.scope)
  }
  if (props.scope && actions.value.length) params.scopeActions = actions.value.join(',')
  return params
})

const catalog = useCatalogList<{ id: string }>({
  fetchUrl: computed(() => `${$apiPath}/${props.resourceType}`),
  query,
  facetsFields: '',
})
</script>
