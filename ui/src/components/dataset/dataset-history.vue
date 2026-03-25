<template>
  <div>
    <v-row
      class="mr-0 mb-2"
      align="center"
    >
      <v-spacer />
      <v-select
        v-model="pageSize"
        :items="[10, 20, 50]"
        hide-details
        density="compact"
        style="max-width: 120px;"
        class="mr-2"
        @update:model-value="refresh"
      />
      <v-btn
        icon
        size="small"
        color="primary"
        @click="refresh"
      >
        <v-icon :icon="mdiRefresh" />
      </v-btn>
    </v-row>

    <v-data-table
      :headers="headers"
      :items="history?.results ?? []"
      :loading="loading"
      items-per-page="-1"
      hide-default-footer
    >
      <template #item._action="{ item, index }">
        <v-icon
          v-if="item._action === 'delete'"
          :icon="mdiDeleteCircle"
          color="warning"
          :title="t('deleted')"
        />
        <v-icon
          v-else-if="item._action === 'create' || (item._action === 'createOrUpdate' && history && index === history.results.length - 1)"
          :icon="mdiPlusCircle"
          color="success"
          :title="t('created')"
        />
        <v-icon
          v-else
          :icon="mdiPencilCircle"
          :title="t('edited')"
        />
      </template>
      <template #item._updatedAt="{ item }">
        {{ new Date(item._updatedAt).toLocaleString() }}
      </template>
    </v-data-table>

    <v-row
      v-if="history?.next"
      justify="center"
      class="ma-2"
    >
      <v-btn
        variant="text"
        color="primary"
        :loading="loading"
        @click="fetchMore"
      >
        {{ t('fetchMore') }}
      </v-btn>
    </v-row>
  </div>
</template>

<i18n lang="yaml">
fr:
  created: Création
  deleted: Suppression
  edited: Édition
  fetchMore: Voir plus
  updatedAt: Date
  id: Identifiant de ligne
en:
  created: Created
  deleted: Deleted
  edited: Edited
  fetchMore: See more
  updatedAt: Date
  id: Line identifier
</i18n>

<script lang="ts" setup>
import {
  mdiDeleteCircle,
  mdiPencilCircle,
  mdiPlusCircle,
  mdiRefresh
} from '@mdi/js'
import useDatasetStore from '~/composables/dataset-store'

const { t } = useI18n()
const { dataset, resourceUrl } = useDatasetStore()

const pageSize = ref(10)
const loading = ref(false)
const history = ref<{ results: any[], next?: string, total?: number } | null>(null)

const headers = computed(() => {
  if (!dataset.value) return []
  const h: any[] = [
    { title: '', key: '_action', sortable: false, width: 40 },
    { title: t('updatedAt'), key: '_updatedAt', sortable: false }
  ]
  if (!(dataset.value.primaryKey?.length)) {
    h.push({ title: t('id'), key: '_id', sortable: false })
  }
  for (const field of (dataset.value.schema ?? []).filter((f: any) => !f['x-calculated'])) {
    h.push({
      title: field.title || field['x-originalName'] || field.key,
      key: field.key,
      sortable: false
    })
  }
  return h
})

async function fetchRevisions (url: string) {
  loading.value = true
  try {
    const data = await $fetch<any>(url)
    if (!history.value) {
      history.value = data
    } else {
      history.value.next = data.next
      history.value.results = history.value.results.concat(data.results)
    }
  } finally {
    loading.value = false
  }
}

function refresh () {
  history.value = null
  fetchRevisions(`${resourceUrl.value}/revisions?size=${pageSize.value}`)
}

function fetchMore () {
  if (history.value?.next) fetchRevisions(history.value.next)
}

onMounted(() => refresh())
</script>
