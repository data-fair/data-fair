<template>
  <v-container>
    <h2 class="text-title-large mb-4">
      {{ t('baseApps') }}
    </h2>
    <v-row>
      <v-col
        cols="12"
        sm="6"
      >
        <v-text-field
          v-model="urlToAdd"
          :label="t('add')"
          :placeholder="t('addPlaceholder')"
          variant="outlined"
          density="compact"
          hide-details
          @keypress.enter="add.execute()"
        />
      </v-col>

      <v-col
        cols="12"
        sm="6"
      >
        <v-text-field
          v-model="q"
          :append-inner-icon="mdiMagnify"
          :label="t('search')"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          @keypress.enter="baseAppsFetch.refresh()"
        />
      </v-col>
    </v-row>

    <v-sheet v-if="baseApps">
      <v-list lines="three">
        <v-list-item
          v-for="baseApp in baseApps"
          :key="baseApp.id"
        >
          <template #prepend>
            <v-avatar rounded="0">
              <img :src="baseApp.thumbnail as string">
            </v-avatar>
          </template>

          <v-list-item-title>
            {{ baseApp.title }}
            <v-chip size="small">
              {{ baseApp.category || t('other') }}
            </v-chip>
            <a
              :href="baseApp.url"
              class="simple-link"
              target="_blank"
            >{{ baseApp.applicationName }} ({{ baseApp.version }})</a>
            <v-icon
              v-if="baseApp.public"
              color="green"
              :icon="mdiLockOpen"
            />
            <template v-else>
              <v-icon
                color="red"
                :icon="mdiLock"
              />
              <span>{{ (baseApp.privateAccess || []).map(p => p.name).join(', ') }}</span>
            </template>
            <v-icon
              v-if="baseApp.deprecated"
              :icon="mdiEyeOff"
            />
          </v-list-item-title>
          <v-list-item-subtitle>{{ baseApp.description }}</v-list-item-subtitle>
          <v-list-item-subtitle>
            <a
              :href="withQuery('/data-fair/applications', {'base-application': baseApp.url, showAll: 'true'})"
              target="_top"
              class="simple-link"
            >
              {{ t('nbApplications', baseApp.nbApplications as number) }}
            </a>
            - {{ t('datasets') }} : {{ baseApp.datasetsFilters }}
          </v-list-item-subtitle>

          <template #append>
            <v-list-item-action>
              <v-icon
                color="primary"
                :icon="mdiPencil"
                @click="currentBaseApp = baseApp; patch = newPatch(baseApp); showEditDialog = true;"
              />
            </v-list-item-action>
          </template>
        </v-list-item>
      </v-list>
    </v-sheet>

    <v-dialog
      v-model="showEditDialog"
      max-width="500"
    >
      <v-card
        v-if="currentBaseApp && patch"
        :title="t('editTitle', { title: currentBaseApp.title })"
      >
        <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
          <v-card-text>
            <p>URL : {{ currentBaseApp.url }}</p>
            <v-checkbox
              v-model="patch.deprecated"
              :label="t('deprecated')"
              class="mb-2"
            />
            <v-form>
              <v-text-field
                v-model="patch.applicationName"
                :label="t('applicationName')"
                name="applicationName"
                class="mb-2"
              />
              <v-text-field
                v-model="patch.version"
                name="version"
                :label="t('version')"
                class="mb-2"
              />
              <v-text-field
                v-model="patch.title"
                :label="t('title')"
                name="title"
                class="mb-2"
              />
              <v-textarea
                v-model="patch.description"
                :label="t('description')"
                name="description"
                class="mb-2"
              />
              <v-text-field
                v-model="patch.image"
                :label="t('image')"
                name="image"
                class="mb-2"
              />
              <v-select
                v-model="patch.category"
                :items="$uiConfig.baseAppsCategories"
                :label="t('category')"
                name="category"
                class="mb-2"
                clearable
              />
              <v-text-field
                v-model="patch.documentation"
                :label="t('documentation')"
                name="documentation"
                class="mb-2"
              />
              <private-access v-model="patch" />
            </v-form>
          </v-card-text>
        </v-defaults-provider>

        <v-card-actions>
          <v-spacer />
          <v-btn
            @click="showEditDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            @click="applyPatch.execute(currentBaseApp, patch); showEditDialog = false"
          >
            {{ t('save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  baseApps: Modèles d'application
  search: Rechercher
  add: Ajouter
  addPlaceholder: Saisissez l'URL d'une nouvelle application
  other: autre
  nbApplications: "{count} application | {count} application | {count} applications"
  datasets: Jeux de données
  editTitle: Édition de {title}
  deprecated: Dépréciée
  applicationName: Identifiant d'application
  version: Version d'application
  title: Titre
  description: Description
  image: Image
  category: Catégorie
  documentation: Documentation
  cancel: Annuler
  save: Enregistrer
en:
  baseApps: Application templates
  search: Search
  add: Add
  addPlaceholder: Enter the URL of a new application
  other: other
  nbApplications: "{count} application | {count} application | {count} applications"
  datasets: Datasets
  editTitle: Edit {title}
  deprecated: Deprecated
  applicationName: Application identifier
  version: Application version
  title: Title
  description: Description
  image: Image
  category: Category
  documentation: Documentation
  cancel: Cancel
  save: Save
</i18n>

<script setup lang="ts">
import type { BaseApp } from '#api/types'
import { mdiEyeOff, mdiLock, mdiLockOpen, mdiMagnify, mdiPencil } from '@mdi/js'
import { withQuery } from 'ufo'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('baseApps') }] })

const q = ref('')
const baseAppsFetch = useFetch<{ results: BaseApp[] }>($apiPath + '/admin/base-applications', {
  query: computed(() => ({ size: 10000, thumbnail: '40x40', count: true, q: q.value })),
  watch: false
})
baseAppsFetch.refresh()
const baseApps = computed(() => {
  return baseAppsFetch.data.value?.results.sort((ba1, ba2) => ba1.title!.localeCompare(ba2.title!))
})
const newPatch = (baseApp: BaseApp) => {
  return {
    title: baseApp.title,
    applicationName: baseApp.applicationName,
    version: baseApp.version,
    description: baseApp.description,
    category: baseApp.category,
    public: baseApp.public,
    deprecated: baseApp.deprecated,
    image: baseApp.image,
    privateAccess: baseApp.privateAccess || []
  }
}

const currentBaseApp = ref<BaseApp>()
const patch = ref<BaseAppPatch>()
const showEditDialog = ref(false)

type BaseAppPatch = Partial<Omit<BaseApp, 'category'>> & { category: string | undefined | null }
const applyPatch = useAsyncAction(async (baseApp: BaseApp, patch: BaseAppPatch) => {
  const actualPatch = { ...patch }
  if (actualPatch.public) actualPatch.privateAccess = []
  actualPatch.category = actualPatch.category || null
  await $fetch(`base-applications/${baseApp.id}`, { method: 'PATCH', body: actualPatch })
  baseAppsFetch.refresh()
})

const urlToAdd = ref('')
const add = useAsyncAction(async () => {
  await $fetch('base-applications', { method: 'POST', body: { url: urlToAdd.value } })
  baseAppsFetch.refresh()
})
</script>

<style lang="css">
</style>
