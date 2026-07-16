<template>
  <v-list-item
    :prepend-icon="mdiFamilyTree"
    class="py-4"
  >
    <div class="text-body-1 font-weight-bold">
      {{ t('partOf') }}
    </div>
    <div class="text-body-medium text-medium-emphasis">
      <i18n-t
        v-if="resource.partOf"
        :keypath="isDataset ? 'currentDescDataset' : 'currentDescApplication'"
        tag="span"
      >
        <template #title>
          <router-link :to="parentLink">
            {{ resource.partOf.title }}
          </router-link>
        </template>
      </i18n-t>
      <template v-else>
        {{ isDataset ? t('descDataset') : t('descApplication') }}
      </template>
    </div>
    <template #append>
      <part-of-dialog
        v-model="showDialog"
        :resource-type="resourceType"
        :resource="resource"
        :candidates="candidates"
        :candidates-loading="candidatesLoading"
        @changed="emit('changed')"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            v-bind="activatorProps"
            variant="outlined"
            color="error"
            class="ml-4 align-self-center"
            @click="emit('open')"
          >
            {{ resource.partOf ? t('unset') : t('define') }}
          </v-btn>
        </template>
      </part-of-dialog>
    </template>
  </v-list-item>
</template>

<i18n lang="yaml">
fr:
  partOf: Ressource parente
  define: Définir comme enfant
  unset: Retirer l'attribut enfant
  descDataset: Définir ce jeu de données comme n'existant que pour servir une ressource parente (jeu de données virtuel ou application).
  descApplication: Définir cette application comme n'existant que pour servir une application parente (par exemple un tableau de bord).
  currentDescDataset: "Ce jeu de données est actuellement défini comme enfant de : {title}"
  currentDescApplication: "Cette application est actuellement définie comme enfant de : {title}"
en:
  partOf: Parent resource
  define: Define as child
  unset: Remove the child attribute
  descDataset: Define this dataset as existing only to serve a parent resource (virtual dataset or application).
  descApplication: Define this application as existing only to serve a parent application (e.g. a dashboard).
  currentDescDataset: "This dataset is currently defined as a child of: {title}"
  currentDescApplication: "This application is currently defined as a child of: {title}"
</i18n>

<script setup lang="ts">
import { mdiFamilyTree } from '@mdi/js'

type PartOf = { type: 'dataset' | 'application', id: string, title?: string }

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string, partOf?: PartOf | null }
  candidates: { type: 'dataset' | 'application', id: string, title: string }[]
  candidatesLoading?: boolean
}>()

const emit = defineEmits<{
  // the page owns the fetches feeding `candidates`, it refreshes them when the dialog opens
  open: []
  changed: []
}>()

const { t } = useI18n()

const showDialog = ref(false)

const isDataset = computed(() => props.resourceType === 'datasets')
// the detail routes are the singular of the resource type, which is exactly what partOf.type holds
const parentLink = computed(() => `/${props.resource.partOf?.type}/${props.resource.partOf?.id}`)
</script>
