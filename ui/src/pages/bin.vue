<template>
  <v-container>
    <v-alert
      v-if="binFetch.error.value"
      type="info"
      variant="tonal"
    >
      {{ t('unavailable') }}
    </v-alert>
    <template v-else>
      <p class="text-body-medium mb-4">
        {{ t('intro', { n: binSettings.retentionDays.value }) }}
      </p>

      <v-text-field
        v-model="search"
        :placeholder="t('search')"
        :prepend-inner-icon="mdiMagnify"
        variant="outlined"
        density="compact"
        max-width="400"
        clearable
        hide-details
        class="mb-4"
      />

      <v-card>
        <v-data-table
          :loading="binFetch.loading.value"
          :loading-text="t('loading')"
          :no-data-text="t('empty')"
          :headers="headers"
          :items="binFetch.data.value?.results ?? []"
          :items-per-page="-1"
          hide-default-footer
        >
          <template #item="{ item }">
            <tr>
              <td>
                <v-icon
                  :icon="item.type === 'datasets' ? mdiDatabase : mdiImageMultiple"
                  :title="item.type === 'datasets' ? t('dataset') : t('application')"
                  size="small"
                />
              </td>
              <td>
                <div class="font-weight-bold">
                  {{ item.title }}
                </div>
                <div class="text-medium-emphasis">
                  {{ item.slug }}
                </div>
                <div
                  v-if="item.fragments"
                  class="text-body-small text-medium-emphasis"
                >
                  {{ t('fragments', { n: item.fragments }, item.fragments) }}
                </div>
              </td>
              <td>{{ item.owner.department ? (item.owner.departmentName || item.owner.department) : '—' }}</td>
              <td>{{ item.shelved.by.name }}</td>
              <td>{{ dayjs(item.shelved.at).format('ll') }}</td>
              <td :class="{ 'text-error': remainingDays(item) <= 3 }">
                {{ remainingDays(item) > 0 ? t('remaining', { n: remainingDays(item) }, remainingDays(item)) : t('imminent') }}
              </td>
              <td>{{ item.storage ? formatBytes(item.storage.size, locale) : '' }}</td>
              <td class="text-no-wrap text-right">
                <v-btn
                  color="primary"
                  variant="tonal"
                  size="small"
                  :loading="restore.loading.value && restoring === item.id"
                  :disabled="restore.loading.value || purge.loading.value"
                  @click="restore.execute(item)"
                >
                  {{ t('restore') }}
                </v-btn>
                <confirm-menu
                  :title="t('purgeTitle')"
                  :text="t('purgeText', { title: item.title })"
                  :tooltip="t('purgeTitle')"
                  :icon="mdiDeleteForever"
                  :btn-props="{ color: 'error', icon: true, variant: 'text', size: 'small', class: 'ml-1', disabled: restore.loading.value || purge.loading.value }"
                  yes-color="error"
                  alert="warning"
                  @confirm="purge.execute(item)"
                />
              </td>
            </tr>
          </template>
        </v-data-table>
      </v-card>
    </template>

    <v-snackbar
      v-model="showRestored"
      :timeout="10000"
      color="success"
    >
      <template v-if="restored">
        {{ t('restored', { title: restored.title }) }}
        <div
          v-if="restored.type === 'datasets' && $uiConfig.catalogsIntegration"
          class="text-body-small mt-1"
        >
          {{ t('restoredCatalogs') }}
        </div>
      </template>
      <template #actions>
        <v-btn
          v-if="restored"
          variant="text"
          :to="restored.type === 'datasets' ? `/dataset/${restored.id}` : `/application/${restored.id}`"
        >
          {{ t('open') }}
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  bin: Corbeille
  intro: Les éléments supprimés sont conservés {n} jours avant suppression définitive. Pendant ce délai ils sont invisibles et inaccessibles, mais restent comptés dans les consommations.
  unavailable: La corbeille n'est pas activée pour ce compte ou vous n'avez pas le rôle administrateur.
  search: Rechercher dans la corbeille…
  loading: Chargement en cours...
  empty: La corbeille est vide.
  type: Type
  dataset: Jeu de données
  application: Application
  title: Titre
  department: Département
  deletedBy: Supprimé par
  deletedAt: Le
  purgeAt: Suppression définitive
  size: Taille
  fragments: "+ {n} fragment | + {n} fragment | + {n} fragments"
  remaining: "dans {n} jour | dans {n} jour | dans {n} jours"
  imminent: imminente
  restore: Restaurer
  purgeTitle: Supprimer définitivement
  purgeText: "« {title} » sera définitivement supprimé. Cette action est irréversible."
  restored: "« {title} » a été restauré"
  restoredCatalogs: Ses publications sur les catalogues distants ne sont pas restaurées.
  open: Ouvrir
en:
  bin: Bin
  intro: Deleted items are kept {n} days before being permanently deleted. Meanwhile they are invisible and inaccessible, but still counted in the consumptions.
  unavailable: The bin is not enabled for this account or you do not have the admin role.
  search: Search in the bin…
  loading: Loading...
  empty: The bin is empty.
  type: Type
  dataset: Dataset
  application: Application
  title: Title
  department: Department
  deletedBy: Deleted by
  deletedAt: On
  purgeAt: Permanent deletion
  size: Size
  fragments: "+ {n} fragment | + {n} fragment | + {n} fragments"
  remaining: "in {n} day | in {n} day | in {n} days"
  imminent: imminent
  restore: Restore
  purgeTitle: Delete permanently
  purgeText: "\"{title}\" will be permanently deleted. This cannot be undone."
  restored: "\"{title}\" was restored"
  restoredCatalogs: Its publications on remote catalogs are not restored.
  open: Open
</i18n>

<script setup lang="ts">
import type { DataTableHeader } from 'vuetify'
import { mdiDatabase, mdiDeleteForever, mdiImageMultiple, mdiMagnify } from '@mdi/js'
import { refDebounced } from '@vueuse/core'
import ConfirmMenu from '~/components/confirm-menu.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { useBinSettings } from '~/composables/use-bin-settings'

type BinItem = {
  type: 'datasets' | 'applications'
  id: string
  slug: string
  title: string
  owner: { type: string, id: string, name?: string, department?: string, departmentName?: string }
  shelved: { at: string, by: { id: string, name: string } }
  storage?: { size: number }
  fragments: number
  purgeAt: string
}

const { t, locale } = useI18n()
const { dayjs } = useLocaleDayjs()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('bin') }] })
const binSettings = useBinSettings()

const search = ref<string | null>('')
const q = refDebounced(search, 300)
const binFetch = useFetch<{ count: number, results: BinItem[] }>($apiPath + '/bin', {
  query: computed(() => q.value ? { q: q.value } : {}),
  notifError: false
})

const headers = computed<DataTableHeader[]>(() => ([
  { title: t('type'), key: 'type', sortable: false },
  { title: t('title'), key: 'title', sortable: false },
  { title: t('department'), key: 'department', sortable: false },
  { title: t('deletedBy'), key: 'deletedBy', sortable: false },
  { title: t('deletedAt'), key: 'deletedAt', sortable: false },
  { title: t('purgeAt'), key: 'purgeAt', sortable: false },
  { title: t('size'), key: 'size', sortable: false },
  { title: '', key: 'actions', sortable: false }
]))

const remainingDays = (item: BinItem) => Math.ceil((new Date(item.purgeAt).getTime() - Date.now()) / 86400000)

const restoring = ref<string | null>(null)
const restored = ref<BinItem | null>(null)
const showRestored = ref(false)
const restore = useAsyncAction(async (item: BinItem) => {
  restoring.value = item.id
  try {
    await $fetch(`/bin/${item.type}/${encodeURIComponent(item.id)}/_restore`, { method: 'POST' })
  } finally {
    restoring.value = null
  }
  restored.value = item
  showRestored.value = true
  await binFetch.refresh()
})

const purge = useAsyncAction(async (item: BinItem) => {
  await $fetch(`/bin/${item.type}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
  await binFetch.refresh()
})
</script>
