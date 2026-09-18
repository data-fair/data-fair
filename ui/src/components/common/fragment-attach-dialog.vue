<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
  >
    <v-card
      :title="t('title')"
      :loading="attach.loading.value"
    >
      <v-card-text>
        <dataset-select
          v-if="resourceType === 'datasets'"
          v-model="parentDataset"
          :label="t('virtualParent')"
          :owner="resource.owner"
          :extra-params="{ virtual: true }"
          :exclude-ids="[resource.id]"
        />
        <v-autocomplete
          v-model="parentApplication"
          :label="t('applicationParent')"
          :items="applicationsFetch.data.value?.results ?? []"
          item-title="title"
          item-value="id"
          return-object
          clearable
          class="mt-2"
        />
        <v-alert
          type="warning"
          variant="outlined"
          class="mt-4"
        >
          {{ t('warning') }}
        </v-alert>
        <v-alert
          type="info"
          variant="outlined"
          class="mt-2"
        >
          {{ t('prerequisites') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="attach.loading.value"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :disabled="!partOf"
          :loading="attach.loading.value"
          @click="attach.execute()"
        >
          {{ t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Rattacher à un parent
  virtualParent: Jeu de données virtuel parent
  applicationParent: Application parente
  warning: "Les permissions propres de la ressource seront définitivement perdues et remplacées par celles dérivées du parent : les détacher ensuite ne les restaurera pas. La ressource ne sera plus listée par défaut et sera supprimée avec son parent."
  prerequisites: "Une ressource publiée sur un portail ou un catalogue, ou configurée comme donnée de référence, ne peut pas être rattachée : retirez ces éléments au préalable."
  cancel: Annuler
  confirm: Rattacher
  successMsg: Ressource rattachée
  errorMsg: "Échec du rattachement"
en:
  title: Attach to a parent
  virtualParent: Parent virtual dataset
  applicationParent: Parent application
  warning: "The resource's own permissions will be permanently lost and replaced by permissions derived from the parent: detaching it later will not restore them. It will no longer be listed by default and will be deleted with its parent."
  prerequisites: "A resource published on a portal or a catalog, or configured as reference data, cannot be attached: remove these first."
  cancel: Cancel
  confirm: Attach
  successMsg: Resource attached
  errorMsg: Failed to attach
</i18n>

<script setup lang="ts">
import type { AccountKeys } from '@data-fair/lib-vue/session'

const props = defineProps<{
  resource: { id: string, owner: AccountKeys }
  resourceType: 'datasets' | 'applications'
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })
const parentDataset = ref<any>(null)
const parentApplication = ref<{ id: string, title: string } | null>(null)

const ownerFilter = computed(() => {
  const o = props.resource.owner
  return `${o.type}:${o.id}${o.department ? ':' + o.department : ''}`
})
const applicationsFetch = useFetch<{ results: { id: string, title: string }[] }>(`${$apiPath}/applications`, {
  query: computed(() => ({ owner: ownerFilter.value, size: 100, select: 'id,title,-userPermissions,-links' }))
})

const partOf = computed<{ type: 'dataset' | 'application', id: string } | null>(() => {
  if (parentApplication.value) return { type: 'application', id: parentApplication.value.id }
  if (parentDataset.value && props.resourceType === 'datasets') return { type: 'dataset', id: parentDataset.value.id }
  return null
})

const attach = useAsyncAction(async () => {
  if (!partOf.value) return
  await $fetch(`${props.resourceType}/${props.resource.id}`, { method: 'PATCH', body: { partOf: partOf.value } })
  showDialog.value = false
  emit('changed')
}, { success: t('successMsg'), error: t('errorMsg') })
</script>
