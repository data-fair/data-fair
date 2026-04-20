<!-- eslint-disable vue/no-v-html -->
<template>
  <template v-if="dataset">
    <template v-if="journal && !dataset.draftReason">
      <v-alert
        v-if="dataset.status === 'error'"
        type="error"
        variant="outlined"
      >
        <p
          v-if="lastProdEvent"
          v-html="lastProdEvent.data"
        />
        <template #append>
          <v-btn
            color="primary"
            @click="patchDataset.execute({})"
          >
            {{ t('restart') }}
          </v-btn>
        </template>
      </v-alert>
      <v-list-item
        v-else-if="lastProdEvent"
        class="pa-2"
      >
        <template #prepend>
          <v-icon
            v-if="['finalize-end', 'publication', 'error', 'draft-cancelled'].includes(lastProdEvent.type)"
            :color="events[lastProdEvent.type].color || 'primary'"
            :icon="events[lastProdEvent.type].icon"
          />
          <v-progress-circular
            v-else
            :size="20"
            :width="3"
            small
            indeterminate
            color="primary"
          />
        </template>
        <span :class="events[lastProdEvent.type].color ? `${events[lastProdEvent.type].color}--text` : ''">
          {{ events[lastProdEvent.type] && (events[lastProdEvent.type].text[locale] || events[lastProdEvent.type].text['fr']) }}
        </span>
      </v-list-item>
    </template>

    <v-alert
      v-if="dataset.draftReason"
      :type="(draftError || draftValidationError) ? 'warning' : 'info'"
      variant="outlined"
    >
      <p v-if="dataset.draftReason.key === 'file-new'">
        {{ t('draftNew1') }}
      </p>

      <p v-else-if="dataset.draftReason.key === 'file-updated'">
        {{ t('draftUpdated1') }}
      </p>

      <p v-else>
        {{ dataset.draftReason.message }}
      </p>

      <template v-if="dataset.status === 'finalized'">
        <p
          v-if="draftError"
          class="mt-4 font-weight-bold"
          v-html="draftError.data"
        />
        <p
          v-if="draftValidationError"
          class="mt-4 font-weight-bold"
          v-html="draftValidationError.data"
        />
        <p class="mt-4">
          <span v-if="dataset.draftReason.key === 'file-new'">
            {{ t('draftNew2') }}&nbsp;
          </span>
          <span v-if="dataset.draftReason.key === 'file-updated'">
            {{ t('draftUpdated2') }}&nbsp;
          </span>

          <span v-if="can('validateDraft').value">
            {{ t('draftValidateCan') }}
          </span>
          <span v-else>
            {{ t('draftValidateCannot') }}
          </span>
        </p>
      </template>

      <template
        v-if="journal"
        #append
      >
        <v-btn
          v-if="dataset.draftReason.key !== 'file-new' && (dataset.status === 'error' || dataset.status === 'finalized')"
          :disabled="!can('cancelDraft').value || validateDraft.loading.value"
          :loading="cancelDraft.loading.value"
          :color="!(draftError || draftValidationError) ? 'warning' : undefined"
          :class="dataset.status === 'finalized' ? 'mr-2' : ''"
          variant="flat"
          @click="cancelDraft.execute()"
        >
          {{ t('cancelDraft') }}
        </v-btn>
        <v-btn
          v-if="dataset.status === 'finalized'"
          :disabled="!can('validateDraft').value || cancelDraft.loading.value"
          :loading="validateDraft.loading.value"
          :color="(draftError || draftValidationError) ? 'warning' : 'primary'"
          variant="flat"
          @click="validateDraft.execute()"
        >
          {{ t('validateDraft') }}
        </v-btn>
      </template>
    </v-alert>
  </template>
</template>

<i18n lang="yaml">
fr:
  draftNew1: Le jeu de données a été créé en mode brouillon. Cet état vous permet de travailler son paramétrage.
  draftNew2: Vérifiez que le fichier a bien été lu, parcourez les 100 premières lignes de la donnée, ajoutez des concepts au schéma, configurez des extensions, etc...
  draftUpdated1: Le jeu de données est passé en mode brouillon suite au chargement d'un nouveau fichier.
  draftUpdated2: Vérifiez que le fichier a bien été lu et que le schéma est correct, parcourez les 100 premières lignes de la donnée, etc.
  draftValidateCan: Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftValidateCannot: Vous n'avez pas la permission pour publier ce brouillon, peut-être devriez-vous contacter un administrateur ?
  restart: Relancer
  cancelDraft: Annuler le brouillon
  validateDraft: Valider le brouillon
  cancelDraftOk: Le brouillon a été annulé.
  cancelDraftKo: Erreur pendant l'annulation du brouillon
  validateDraftOk: Le brouillon a été validé, le jeu de données va être traité intégralement.
  validateDraftKo: Erreur pendant la validation du brouillon
en:
  draftNew1: The dataset was created in draft mode. This state allow you to work on its configuration.
  draftNew2: Check that the file was property read, browse the first 100 lines, add concepts to the schema, configure extensions, etc.
  draftUpdated1: The dataset was switched to draft mode following the upload of a new file.
  draftUpdated2: Check that the file was property read, browse the first 100 lines, etc. When satisfied, validate the draft and the dataset will be processed entirely.
  draftValidateCan: When satisfied, validate the draft and the dataset will be processed entirely.
  draftValidateCannot: You lack the permission to validate this draft, you should contact an admin.
  restart: Restart
  cancelDraft: Cancel the draft
  validateDraft: Validate the draft
  cancelDraftOk: The draft was cancelled.
  cancelDraftKo: Error while cancelling the draft
  validateDraftOk: The draft was validated, the dataset will be processed entirely.
  validateDraftKo: Error while validating the draft
</i18n>

<script setup lang="ts">
import allEvents from '~/../../shared/events.json'

const events = allEvents.dataset as Record<string, { icon: string, color?: string, text: Record<string, string> }>

const { t, locale } = useI18n()

const datasetStore = useDatasetStore()
const { dataset, journal, journalFetch, can, patchDataset } = datasetStore
if (!journalFetch.initialized.value) journalFetch.refresh()

const lastProdEvent = computed(() => {
  for (const event of journal.value ?? []) {
    if (!event.draft) return event
  }
  return null
})

const draftError = computed(() => getLastDraftEvent('error'))
const draftValidationError = computed(() => getLastDraftEvent('validation-error'))

const getLastDraftEvent = (eventType: string) => {
  if (dataset.value?.status !== 'finalized') return null
  let inCurrentDraft = false
  for (const event of journal.value ?? []) {
    if (inCurrentDraft && !event.draft) break
    if (inCurrentDraft && event.type === 'finalize-end') break
    if (event.type === 'finalize-end') inCurrentDraft = true
    if (inCurrentDraft && event.type === eventType) return event
  }
  return null
}

const cancelDraft = useAsyncAction(async () => {
  if (!dataset.value) return
  await $fetch(`datasets/${dataset.value.id}/draft`, { method: 'delete' })
}, { success: t('cancelDraftOk'), error: t('cancelDraftKo') })

const validateDraft = useAsyncAction(async () => {
  if (!dataset.value) return
  await $fetch(`datasets/${dataset.value.id}/draft`, { method: 'post' })
}, { success: t('validateDraftOk'), error: t('validateDraftKo') })

</script>

<style lang="css">
</style>
