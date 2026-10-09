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
          {{ t(`${resourceType}.intro`, { parent: parent.title }) }}
        </p>
        <v-alert
          type="warning"
          variant="outlined"
        >
          {{ t(`${resourceType}.warning`) }}
        </v-alert>
        <v-alert
          type="info"
          variant="outlined"
          class="mt-2"
        >
          {{ t(`${resourceType}.prerequisites`) }}
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
  datasets:
    intro: "Ce jeu de données deviendra un fragment de « {parent} », le jeu de données virtuel qui l'utilise déjà comme source."
    warning: "Les permissions propres du jeu de données seront définitivement perdues et remplacées par celles dérivées du parent : le détacher ensuite ne les restaurera pas. Il ne sera plus listé par défaut et sera supprimé avec son parent."
    prerequisites: "Un jeu de données publié sur un portail ou un catalogue, ou configuré comme donnée de référence, ne peut pas être rattaché : retirez ces éléments au préalable."
    successMsg: Jeu de données rattaché
  applications:
    intro: "Cette application deviendra un fragment de « {parent} », l'application qui l'intègre déjà."
    warning: "Les permissions propres de l'application seront définitivement perdues et remplacées par celles dérivées du parent : qui peut consulter le parent pourra la consulter, et elle ne sera plus accessible à qui ne peut pas le consulter. La détacher ensuite ne les restaurera pas. Elle ne sera plus listée par défaut et sera supprimée avec son parent."
    prerequisites: "Une application publiée sur un portail ou un catalogue ne peut pas être rattachée : retirez ces publications au préalable."
    successMsg: Application rattachée
  cancel: Annuler
  confirm: Rattacher
  errorMsg: "Échec du rattachement"
en:
  title: "Attach to “{parent}”"
  datasets:
    intro: "This dataset will become a fragment of “{parent}”, the virtual dataset that already uses it as a source."
    warning: "The dataset's own permissions will be permanently lost and replaced by permissions derived from the parent: detaching it later will not restore them. It will no longer be listed by default and will be deleted with its parent."
    prerequisites: "A dataset published on a portal or a catalog, or configured as reference data, cannot be attached: remove these first."
    successMsg: Dataset attached
  applications:
    intro: "This application will become a fragment of “{parent}”, the application that already embeds it."
    warning: "The application's own permissions will be permanently lost and replaced by permissions derived from the parent: whoever can view the parent will be able to view it, and it will no longer be reachable by anyone who cannot. Detaching it later will not restore them. It will no longer be listed by default and will be deleted with its parent."
    prerequisites: "An application published on a portal or a catalog cannot be attached: remove these publications first."
    successMsg: Application attached
  cancel: Cancel
  confirm: Attach
  errorMsg: Failed to attach
</i18n>

<script setup lang="ts">
// Attachment is only ever proposed towards a parent that is already known to use the resource
// (the one virtual dataset having this dataset among its children, the one application having this
// application in its configuration), never picked freely.
const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string }
  parent: { id: string, title: string }
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })

const attach = useAsyncAction(async () => {
  // the parent is of the same type as the resource: a virtual dataset, or an application
  const parentType = props.resourceType === 'datasets' ? 'dataset' : 'application'
  await $fetch(`${props.resourceType}/${props.resource.id}`, { method: 'PATCH', body: { partOf: { type: parentType, id: props.parent.id } } })
  showDialog.value = false
  emit('changed')
}, { success: t(`${props.resourceType}.successMsg`), error: t('errorMsg') })
</script>
