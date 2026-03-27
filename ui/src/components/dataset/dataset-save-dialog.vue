<template>
  <v-dialog
    v-model="showDialog"
    max-width="600"
  >
    <v-card>
      <v-card-title>{{ t('confirmSave') }}</v-card-title>
      <v-card-text>
        <p>{{ t('confirmSaveMessage') }}</p>

        <!-- AI Summary section -->
        <v-btn
          v-if="$uiConfig.agentsIntegration"
          :loading="summaryLoading"
          variant="outlined"
          class="mb-4 mt-4"
          @click="requestSummary"
        >
          {{ t('summarizeChanges') }}
        </v-btn>

        <v-alert
          v-if="summary"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ summary }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="showDialog = false">
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          @click="confirmSave"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  confirmSave: Confirmer l'enregistrement
  confirmSaveMessage: Êtes-vous sûr de vouloir enregistrer ces modifications ?
  summarizeChanges: Résumer les modifications
  cancel: Annuler
  save: Enregistrer
en:
  confirmSave: Confirm save
  confirmSaveMessage: Are you sure you want to save these changes?
  summarizeChanges: Summarize changes
  cancel: Cancel
  save: Save
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  data: any
  serverData: any
}>()

const showDialog = defineModel<boolean>({ default: false })
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()

const { account } = useSessionAuthenticated()
const summaryLoading = ref(false)
const summary = ref('')

const requestSummary = async () => {
  summaryLoading.value = true
  try {
    const oldJson = JSON.stringify(props.serverData, null, 2)
    const newJson = JSON.stringify(props.data, null, 2)
    const content = `Old version:\n${oldJson}\n\nNew version:\n${newJson}`
    const result = await $fetch<{ summary: string }>(`${window.location.origin}/agents/api/summary/${account.value.type}/${account.value.id}`, {
      method: 'POST',
      body: { content, prompt: 'Compare the old and new versions and summarize the changes concisely:' }
    })
    summary.value = result.summary
  } catch {
    // summary is optional, failure is non-critical
  } finally {
    summaryLoading.value = false
  }
}

const confirmSave = () => {
  emit('confirm')
  showDialog.value = false
}

// Reset summary when dialog is reopened
watch(showDialog, (val) => {
  if (val) {
    summary.value = ''
  }
})
</script>
