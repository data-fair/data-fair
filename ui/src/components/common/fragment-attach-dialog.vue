<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
  >
    <v-card
      :title="t('title', { parent: parent.title })"
      :loading="attach.loading.value"
    >
      <v-card-text>
        <p class="mb-4">
          {{ t('intro', { parent: parent.title }) }}
        </p>
        <v-alert
          type="warning"
          variant="outlined"
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
  title: "Rattacher à « {parent} »"
  intro: "Ce jeu de données deviendra un fragment de « {parent} », le jeu de données virtuel qui l'utilise déjà comme source."
  warning: "Les permissions propres du jeu de données seront définitivement perdues et remplacées par celles dérivées du parent : le détacher ensuite ne les restaurera pas. Il ne sera plus listé par défaut et sera supprimé avec son parent."
  prerequisites: "Un jeu de données publié sur un portail ou un catalogue, ou configuré comme donnée de référence, ne peut pas être rattaché : retirez ces éléments au préalable."
  cancel: Annuler
  confirm: Rattacher
  successMsg: Jeu de données rattaché
  errorMsg: "Échec du rattachement"
en:
  title: "Attach to “{parent}”"
  intro: "This dataset will become a fragment of “{parent}”, the virtual dataset that already uses it as a source."
  warning: "The dataset's own permissions will be permanently lost and replaced by permissions derived from the parent: detaching it later will not restore them. It will no longer be listed by default and will be deleted with its parent."
  prerequisites: "A dataset published on a portal or a catalog, or configured as reference data, cannot be attached: remove these first."
  cancel: Cancel
  confirm: Attach
  successMsg: Dataset attached
  errorMsg: Failed to attach
</i18n>

<script setup lang="ts">
// Attachment is only ever proposed towards a parent that is already known to use the resource
// (today: the one virtual dataset having this dataset among its children), never picked freely.
const props = defineProps<{
  resource: { id: string }
  parent: { id: string, title: string }
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })

const attach = useAsyncAction(async () => {
  await $fetch(`datasets/${props.resource.id}`, { method: 'PATCH', body: { partOf: { type: 'dataset', id: props.parent.id } } })
  showDialog.value = false
  emit('changed')
}, { success: t('successMsg'), error: t('errorMsg') })
</script>
