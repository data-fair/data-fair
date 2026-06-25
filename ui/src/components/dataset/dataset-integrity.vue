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

      <template v-if="state.active">
        <v-divider class="my-4" />
        <h4 class="text-subtitle-1 mb-2">
          {{ t('historyTitle') }}
        </h4>
        <v-data-table-server
          :headers="headers"
          :items="revisions"
          :items-length="revisionsCount"
          :loading="loadRevisions.loading.value"
          :items-per-page="size"
          :page="page"
          density="compact"
          @update:page="(p) => { page = p; loadRevisions.execute() }"
        >
          <template #item.date="{ item }">
            {{ formatDate(item.date) }}
          </template>
          <template #item.md5="{ item }">
            <code class="text-caption">{{ item.md5.slice(0, 12) }}…</code>
          </template>
          <template #item.operation="{ item }">
            {{ t('op_' + item.operation) }}
          </template>
        </v-data-table-server>
      </template>
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
  historyTitle: Historique des révisions
  colIndex: "#"
  colOperation: Opération
  colDate: Date
  colOriginator: Auteur
  colHash: Empreinte
  op_create: Création
  op_update: Mise à jour
  op_enable: Activation
  op_fixIntegrity: Réconciliation
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
  historyTitle: Revision history
  colIndex: "#"
  colOperation: Operation
  colDate: Date
  colOriginator: Author
  colHash: Hash
  op_create: Create
  op_update: Update
  op_enable: Enable
  op_fixIntegrity: Reconcile
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

const size = 10
const page = ref(1)
const revisions = ref<any[]>([])
const revisionsCount = ref(0)

const headers = computed(() => [
  { title: t('colIndex'), key: 'i', width: 60 },
  { title: t('colOperation'), key: 'operation', sortable: false },
  { title: t('colDate'), key: 'date', sortable: false },
  { title: t('colOriginator'), key: 'originator', sortable: false },
  { title: t('colHash'), key: 'md5', sortable: false }
])

const loadRevisions = useAsyncAction(async () => {
  if (!dataset.value) return
  const res = await $fetch(`datasets/${dataset.value.id}/_integrity/revisions`, { params: { size, page: page.value } })
  revisions.value = res.results
  revisionsCount.value = res.count
})

const load = async () => {
  if (!dataset.value) return
  state.value = await $fetch(`datasets/${dataset.value.id}/_integrity`)
  if (state.value?.active) await loadRevisions.execute()
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
