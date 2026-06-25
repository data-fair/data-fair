<template>
  <div class="pa-4">
    <template v-if="state">
      <v-alert
        v-if="!state.active"
        type="info"
        variant="tonal"
        :text="t('disabledInfo')"
      />
      <v-alert
        v-else-if="state.lastCheck?.status === 'breach'"
        type="error"
        variant="outlined"
        :title="t('breachTitle')"
        :text="t('breachBody')"
      />
      <v-alert
        v-else-if="state.lastCheck?.status === 'ok'"
        type="success"
        variant="outlined"
        :text="t('okBody')"
      />
      <v-alert
        v-else
        type="warning"
        variant="tonal"
        :text="t('notCheckedBody')"
      />

      <div class="d-flex align-center ga-2 mt-4">
        <span v-if="state.lastCheck">{{ t('lastCheck') }}: {{ formatDate(state.lastCheck.date) }}</span>
        <span v-else>{{ t('neverChecked') }}</span>
        <v-spacer />
        <v-btn
          v-if="state.active"
          :prepend-icon="mdiShieldRefresh"
          :loading="check.loading.value"
          color="primary"
          variant="text"
          size="small"
          @click="check.execute()"
        >
          {{ t('checkNow') }}
        </v-btn>
        <v-btn
          v-if="state.active && state.lastCheck?.status === 'breach'"
          :prepend-icon="mdiWrench"
          :loading="fix.loading.value"
          color="warning"
          variant="text"
          size="small"
          @click="fix.execute()"
        >
          {{ t('fix') }}
        </v-btn>
      </div>

      <v-divider class="my-4" />

      <v-switch
        :model-value="state.active"
        :label="t('enableLabel')"
        :loading="toggle.loading.value"
        color="primary"
        density="compact"
        hide-details
        @update:model-value="(v) => toggle.execute(!!v)"
      />
    </template>
    <v-skeleton-loader
      v-else
      type="paragraph"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  disabledInfo: Le contrôle d'intégrité n'est pas activé pour ce jeu de données.
  breachTitle: Intégrité compromise
  breachBody: Le fichier de données a été modifié en dehors du circuit d'écriture légitime.
  okBody: L'intégrité a été vérifiée, aucune divergence détectée.
  notCheckedBody: L'intégrité est activée mais aucun contrôle n'a encore été effectué.
  lastCheck: Dernier contrôle
  neverChecked: Aucun contrôle effectué
  checkNow: Contrôler maintenant
  fix: Réconcilier
  enableLabel: Activer le contrôle d'intégrité
  checkOk: Contrôle effectué
  fixOk: Réconciliation effectuée
  toggleOk: Configuration enregistrée
en:
  disabledInfo: Integrity checking is not enabled for this dataset.
  breachTitle: Integrity breach
  breachBody: The data file was modified outside the legitimate write path.
  okBody: Integrity verified, no divergence detected.
  notCheckedBody: Integrity is enabled but no check has been run yet.
  lastCheck: Last check
  neverChecked: No check run yet
  checkNow: Check now
  fix: Reconcile
  enableLabel: Enable integrity checking
  checkOk: Check completed
  fixOk: Reconciliation completed
  toggleOk: Configuration saved
</i18n>

<script setup lang="ts">
import { mdiShieldRefresh, mdiWrench } from '@mdi/js'

const { t, locale } = useI18n()
const { dataset } = useDatasetStore()

type IntegrityState = {
  active: boolean
  lastCheck?: { date: string, status: 'ok' | 'breach' }
  lastRevision?: { i: number, md5: string, date: string }
}

const state = ref<IntegrityState | null>(null)

const load = async () => {
  if (!dataset.value) return
  state.value = await $fetch(`datasets/${dataset.value.id}/_integrity`)
}
load()

const check = useAsyncAction(async () => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity/_check`, { method: 'POST' })
  await load()
}, { success: t('checkOk') })

const fix = useAsyncAction(async () => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity/_fix`, { method: 'POST' })
  await load()
}, { success: t('fixOk') })

const toggle = useAsyncAction(async (active: boolean) => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity`, { method: 'PUT', body: { active } })
  await load()
}, { success: t('toggleOk') })

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString(locale.value)

defineExpose({ load })
</script>
