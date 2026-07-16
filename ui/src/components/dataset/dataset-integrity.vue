<template>
  <div class="pa-4">
    <template v-if="state">
      <v-alert
        v-if="!state.active"
        type="info"
        variant="tonal"
        :text="t('disabledInfo')"
      />

      <template v-if="state.active">
        <v-alert
          v-if="state.lastCheck?.status === 'breach'"
          type="error"
          variant="outlined"
          density="compact"
          :title="t('breachTitle')"
          :text="(state.lastCheck.breach ?? []).map(p => t('part_' + p)).join(', ') + ' — ' + t('breachBody')"
        />
        <v-alert
          v-else-if="state.lastCheck?.status === 'ok'"
          type="success"
          variant="outlined"
          density="compact"
          :text="t('okBody')"
        />
        <v-alert
          v-else
          type="warning"
          variant="tonal"
          density="compact"
          :text="t('notCheckedBody')"
        />
        <v-alert
          v-if="state.lastRenewal?.status === 'failed'"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-1"
          :title="t('renewalFailedTitle')"
          :text="t('renewalFailedBody')"
        />
        <div
          v-if="state.lastCheck"
          class="text-caption mt-1"
        >
          {{ t('lastCheck') }}: {{ formatDate(state.lastCheck.date) }}
        </div>
      </template>

      <div class="d-flex align-center ga-2 mt-4">
        <v-spacer />
        <v-btn
          v-if="adminMode && state.active"
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
          v-if="adminMode && state.active && anyBreach"
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

      <template v-if="adminMode">
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
          <template #item.hash="{ item }">
            <code class="text-caption">{{ (item.hash.md5 ?? item.hash.sha256 ?? '').slice(0, 12) }}…</code>
          </template>
          <template #item.operation="{ item }">
            {{ t('op_' + item.operation) }}
          </template>
          <template #item.origin="{ item }">
            {{ t('origin_' + item.origin) }}
          </template>
        </v-data-table-server>
      </template>
    </template>
    <v-skeleton-loader
      v-else-if="load.loading.value"
      type="paragraph"
    />
    <v-alert
      v-else
      type="error"
      variant="tonal"
      :text="t('loadError')"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  disabledInfo: Le contrôle d'intégrité n'est pas activé pour ce jeu de données.
  part_file: Fichier de données
  part_metadata: Métadonnées
  breachTitle: Intégrité compromise
  breachBody: modifié(es) en dehors du circuit d'écriture légitime
  okBody: L'intégrité a été vérifiée, aucune divergence détectée.
  notCheckedBody: L'intégrité est activée mais aucun contrôle n'a encore été effectué.
  renewalFailedTitle: Renouvellement du verrou en échec
  renewalFailedBody: Le renouvellement de la protection anti-altération échoue. La garantie expirera à la date de rétention de l'ancre si le problème n'est pas résolu.
  lastCheck: Dernier contrôle
  neverChecked: Aucun contrôle effectué
  checkNow: Contrôler maintenant
  fix: Réconcilier
  enableLabel: Activer le contrôle d'intégrité
  checkOk: Contrôle effectué
  fixOk: Réconciliation effectuée
  toggleOk: Configuration enregistrée
  loadError: Impossible de charger l'état d'intégrité.
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
  origin_user: Utilisateur
  origin_superadmin: Superadmin
  origin_worker: Traitement interne
  origin_propagation: Propagation
  origin_upgrade: Script de migration
en:
  disabledInfo: Integrity checking is not enabled for this dataset.
  part_file: Data file
  part_metadata: Metadata
  breachTitle: Integrity breach
  breachBody: modified outside the legitimate write path
  okBody: Integrity verified, no divergence detected.
  notCheckedBody: Integrity is enabled but no check has been run yet.
  renewalFailedTitle: Lock renewal failing
  renewalFailedBody: Renewal of the tamper-protection lock is failing. The guarantee will lapse at the anchor's retain-until date unless resolved.
  lastCheck: Last check
  neverChecked: No check run yet
  checkNow: Check now
  fix: Reconcile
  enableLabel: Enable integrity checking
  checkOk: Check completed
  fixOk: Reconciliation completed
  toggleOk: Configuration saved
  loadError: Could not load the integrity status.
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
  origin_user: User
  origin_superadmin: Superadmin
  origin_worker: Internal worker
  origin_propagation: Propagation
  origin_upgrade: Upgrade script
</i18n>

<script setup lang="ts">
import { mdiShieldRefresh, mdiWrench } from '@mdi/js'
import type { Dataset } from '#api/types'

const { t, locale } = useI18n()
const datasetStore = useDatasetStore()
const { dataset } = datasetStore
const session = useSession()
// the panel (status + revision history) is visible to the owner's admins; the enable/disable and
// check/fix write actions stay superadmin-only
const adminMode = computed(() => !!session.state.user?.adminMode)

type IntegrityState = NonNullable<Dataset['integrity']>
type RevisionEntry = { i: number, hash: { md5?: string, sha256?: string }, date: string, operation: string, origin: string, reason?: string }

const state = ref<IntegrityState | null>(null)

const anyBreach = computed(() => state.value?.lastCheck?.status === 'breach')

const size = 10
const page = ref(1)
const revisions = ref<RevisionEntry[]>([])
const revisionsCount = ref(0)

const headers = computed(() => [
  { title: t('colIndex'), key: 'i', width: 60 },
  { title: t('colOperation'), key: 'operation', sortable: false },
  { title: t('colDate'), key: 'date', sortable: false },
  { title: t('colOriginator'), key: 'origin', sortable: false },
  { title: t('colHash'), key: 'hash', sortable: false }
])

const loadRevisions = useAsyncAction(async () => {
  if (!dataset.value) return
  const res = await $fetch<{ count: number, results: RevisionEntry[] }>(`datasets/${dataset.value.id}/_integrity/revisions`, { params: { size, page: page.value } })
  revisions.value = res.results
  revisionsCount.value = res.count
})

// wrapped in useAsyncAction so a first-load failure surfaces an error (and load.loading drives the
// skeleton vs. error states in the template) instead of leaving a perpetual skeleton.
const load = useAsyncAction(async () => {
  if (!dataset.value) return
  state.value = await $fetch<IntegrityState>(`datasets/${dataset.value.id}/_integrity`)
  if (state.value?.active) {
    page.value = 1 // a post-action refetch may shrink the history; avoid landing on a now-empty page
    await loadRevisions.execute()
  }
})
load.execute()

const check = useAsyncAction(async () => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity/_check`, { method: 'POST' })
  await load.execute()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
}, { success: t('checkOk') })

const fix = useAsyncAction(async () => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity/_fix`, { method: 'POST' })
  await load.execute()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
}, { success: t('fixOk') })

const toggle = useAsyncAction(async (active: boolean) => {
  await $fetch(`datasets/${dataset.value!.id}/_integrity`, { method: 'PUT', body: { active } })
  await load.execute()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
}, { success: t('toggleOk') })

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString(locale.value)

defineExpose({ load })
</script>
