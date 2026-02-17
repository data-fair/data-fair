<template lang="html">
  <v-container>
    <v-row>
      <v-col>
        <h2 class="text-h6 mb-4">
          Modèles d'application
        </h2>
        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <v-text-field
              v-model="q"
              name="q"
              label="Rechercher"
              hide-details
              variant="outlined"
              density="compact"
              :append-icon="mdiMagnify"
              @keypress.enter="baseAppsFetch.refresh()"
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <v-text-field
              v-model="urlToAdd"
              label="Ajouter"
              placeholder="Saisissez l'URL d'une nouvelle application"
              @keypress.enter="add.execute()"
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
                <v-avatar tile>
                  <img :src="baseApp.thumbnail as string">
                </v-avatar>
              </template>

              <v-list-item-title>
                {{ baseApp.title }}
                <v-chip size="small">
                  {{ baseApp.category || 'autre' }}
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
                  :href="withQuery('/data-fair/applications', {url: baseApp.url, showAll: 'true'})"
                  target="_top"
                  class="simple-link"
                >
                  {{ baseApp.nbApplications }} application{{ (baseApp.nbApplications as number) > 1 ? 's' : '' }}
                </a>
                - Jeux de données : {{ baseApp.datasetsFilters }}
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
      </v-col>
    </v-row>

    <v-dialog
      v-model="showEditDialog"
      max-width="500px"
    >
      <v-card v-if="currentBaseApp && patch">
        <v-card-title primary-title>
          <h3 class="text-h6 mb-0">
            Édition de {{ currentBaseApp.title }}
          </h3>
        </v-card-title>
        <v-card-text>
          <p>URL : {{ currentBaseApp.url }}</p>
          <v-checkbox
            v-model="patch.deprecated"
            label="Dépréciée"
          />
          <v-form>
            <v-text-field
              v-model="patch.applicationName"
              name="applicationName"
              label="Identifiant d'application"
            />
            <v-text-field
              v-model="patch.version"
              name="version"
              label="Version d'application"
            />
            <v-text-field
              v-model="patch.title"
              name="title"
              label="Titre"
            />
            <v-textarea
              v-model="patch.description"
              name="description"
              label="Description"
            />
            <v-text-field
              v-model="patch.image"
              name="image"
              label="Image"
            />
            <v-select
              v-model="patch.category"
              name="category"
              label="Catégorie"
              clearable
              :items="$uiConfig.baseAppsCategories"
            />
            <v-text-field
              v-model="patch.documentation"
              name="documentation"
              label="Documentation"
            />
            <private-access v-model="patch" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="showEditDialog = false"
          >
            Annuler
          </v-btn>
          <v-btn
            color="primary"
            @click="applyPatch.execute(currentBaseApp, patch); showEditDialog = false"
          >
            Enregistrer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import type { BaseApp } from '#api/types'
import { mdiEyeOff, mdiLock, mdiLockOpen, mdiMagnify, mdiPencil } from '@mdi/js'
import { withQuery } from 'ufo'

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
