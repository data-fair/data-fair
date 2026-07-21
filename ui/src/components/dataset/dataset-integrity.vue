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

      <template v-if="state.active && dataset?.isRest">
        <v-divider class="my-4" />
        <div class="text-body-2">
          {{ state.lines?.anchored ?? 0 }} {{ t('linesAnchored') }}
        </div>
        <template v-if="(state.lines?.pending ?? 0) > 0">
          <div class="text-caption mt-1">
            {{ state.lines!.pending }} {{ t('linesPending') }}
          </div>
          <v-progress-linear
            indeterminate
            color="primary"
            class="mt-1"
          />
        </template>
        <v-alert
          v-if="state.lines?.overGate"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
          :text="t('linesOverGate')"
        />
        <v-alert
          v-if="(state.lastCheck?.lines?.diverged ?? 0) > 0"
          type="error"
          variant="outlined"
          density="compact"
          class="mt-2"
          :title="`${state.lastCheck!.lines!.diverged} ${t('linesDivergedTitle')}`"
        >
          <div class="d-flex flex-wrap align-center ga-2 mt-2">
            <div
              v-for="lineId of state.lastCheck!.lines!.sample ?? []"
              :key="lineId"
              class="d-flex align-center ga-1"
            >
              <v-chip
                size="small"
                label
              >
                {{ lineId }}
              </v-chip>
              <v-btn
                :icon="mdiHistory"
                variant="text"
                size="x-small"
                :title="t('viewLineRevisions')"
                @click="openLineRevisions(lineId)"
              />
            </div>
          </div>
          <div
            v-if="adminMode"
            class="mt-2"
          >
            <v-btn
              :prepend-icon="mdiBackupRestore"
              color="warning"
              variant="text"
              size="small"
              @click="linesRestoreDialog = true"
            >
              {{ t('linesRestore') }}
            </v-btn>
          </div>
        </v-alert>
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
          :title="t('fixHelp')"
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
          <template #item.actions="{ item }">
            <template v-if="item.hasPayload">
              <v-btn
                :icon="mdiFileCompare"
                variant="text"
                size="x-small"
                :loading="openDiff.loading.value"
                :title="t('viewDiff')"
                @click="openDiff.execute(item.i)"
              />
              <v-btn
                v-if="item.fileSize"
                :icon="mdiDownload"
                variant="text"
                size="x-small"
                :title="t('downloadPayload')"
                download
                :href="`${$apiPath}/datasets/${dataset!.id}/_integrity/revisions/${item.i}/file`"
              />
              <v-btn
                v-if="adminMode"
                :icon="mdiBackupRestore"
                variant="text"
                size="x-small"
                color="warning"
                :title="t('restore')"
                @click="restoreTarget = item.i; restoreReason = ''"
              />
            </template>
            <span
              v-else
              class="text-caption text-disabled"
            >{{ t('noPayload') }}</span>
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

    <v-dialog
      v-model="diffOpen"
      max-width="1100"
    >
      <v-card :title="t('diffTitle', { i: diffData?.i })">
        <v-card-text v-if="diffData">
          <p
            v-if="!diffKeys.length"
            class="text-caption"
          >
            {{ t('noDiff') }}
          </p>
          <template
            v-for="key of diffKeys"
            :key="key"
          >
            <h4 class="text-subtitle-2 mt-2">
              {{ key }}
            </h4>
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption">
                  {{ t('diffRevision') }}
                </div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(diffData.payload.metadata[key]) }}</pre>
              </v-col>
              <v-col cols="6">
                <div class="text-caption">
                  {{ t('diffCurrent') }}
                </div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(diffData.current?.[key]) }}</pre>
              </v-col>
            </v-row>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="restoreTarget !== null"
      max-width="500"
      @update:model-value="(v) => { if (!v) restoreTarget = null }"
    >
      <v-card :title="t('restoreTitle', { i: restoreTarget })">
        <v-card-text>
          <p class="mb-2">
            {{ t('restoreWarning') }}
          </p>
          <v-text-field
            v-model="restoreReason"
            :label="t('restoreReason')"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="restoreTarget = null">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            :loading="restore.loading.value"
            @click="restore.execute()"
          >
            {{ t('restore') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="linesRestoreDialog"
      max-width="500"
    >
      <v-card :title="t('linesRestoreTitle')">
        <v-card-text>
          <p class="mb-2">
            {{ t('linesRestoreWarning') }}
          </p>
          <v-text-field
            v-model="linesRestoreReason"
            :label="t('restoreReason')"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="linesRestoreDialog = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="warning"
            :loading="linesRestore.loading.value"
            @click="linesRestore.execute()"
          >
            {{ t('linesRestore') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="lineRevisionsOpen"
      max-width="900"
    >
      <v-card :title="t('lineRevisionsTitle', { lineId: lineRevisionsLineId })">
        <v-card-text>
          <v-data-table-server
            :headers="lineRevisionHeaders"
            :items="lineRevisions"
            :items-length="lineRevisionsCount"
            :loading="loadLineRevisions.loading.value"
            :items-per-page="lineRevisionsSize"
            :page="lineRevisionsPage"
            density="compact"
            @update:page="(p) => { lineRevisionsPage = p; loadLineRevisions.execute() }"
          >
            <template #item.date="{ item }">
              {{ formatDate(item.date) }}
            </template>
            <template #item.operation="{ item }">
              {{ t('op_' + item.operation) }}
            </template>
            <template #item.origin="{ item }">
              {{ t('origin_' + item.origin) }}
            </template>
            <template #item.actions="{ item }">
              <v-btn
                v-if="item.hasPayload"
                :icon="mdiFileCompare"
                variant="text"
                size="x-small"
                :loading="openLineDiff.loading.value"
                :title="t('viewDiff')"
                @click="openLineDiff.execute(item.i)"
              />
              <span
                v-else
                class="text-caption text-disabled"
              >{{ t('noPayload') }}</span>
            </template>
          </v-data-table-server>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="lineRevisionsOpen = false">
            {{ t('close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="lineDiffOpen"
      max-width="1100"
    >
      <v-card :title="t('diffTitle', { i: lineDiffData?.i })">
        <v-card-text v-if="lineDiffData">
          <p
            v-if="lineDiffData.line?.deleted"
            class="text-caption"
          >
            {{ t('lineDeletedRevision') }}
          </p>
          <p
            v-else-if="!lineDiffKeys.length"
            class="text-caption"
          >
            {{ t('noDiff') }}
          </p>
          <template
            v-for="key of lineDiffKeys"
            :key="key"
          >
            <h4 class="text-subtitle-2 mt-2">
              {{ key }}
            </h4>
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption">
                  {{ t('diffRevision') }}
                </div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(lineDiffData.payload?.[key]) }}</pre>
              </v-col>
              <v-col cols="6">
                <div class="text-caption">
                  {{ t('diffCurrent') }}
                </div>
                <pre class="text-caption bg-surface-light pa-2 overflow-auto">{{ pretty(lineDiffData.current?.[key]) }}</pre>
              </v-col>
            </v-row>
          </template>
        </v-card-text>
      </v-card>
    </v-dialog>
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
  fixHelp: Ancre l'état courant du fichier, des métadonnées et, pour un jeu de données éditable, de chaque ligne comme référence légitime.
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
  op_restore: Restauration
  op_delete: Suppression
  origin_user: Utilisateur
  origin_superadmin: Superadmin
  origin_worker: Traitement interne
  origin_propagation: Propagation
  origin_upgrade: Script de migration
  viewDiff: Voir les différences
  downloadPayload: Télécharger le fichier historisé
  restore: Restaurer
  noPayload: non restaurable
  diffTitle: "Révision {i} — différences avec l'état courant"
  noDiff: Aucune différence de métadonnées avec l'état courant.
  diffRevision: Révision
  diffCurrent: État courant
  restoreTitle: "Restaurer la révision {i}"
  restoreWarning: Les métadonnées couvertes et le fichier de données seront restaurés à l'état de cette révision. Un fichier différent déclenche un retraitement complet du jeu de données.
  restoreReason: Raison (optionnelle, tracée dans l'historique)
  cancel: Annuler
  close: Fermer
  restoreOk: Restauration lancée
  linesAnchored: lignes ancrées
  linesPending: lignes en attente d'ancrage
  linesOverGate: Ce jeu de données dépasse le seuil de lignes recommandé pour le suivi d'intégrité — l'ancrage continue mais les contrôles et renouvellements de verrous sont coûteux.
  linesDivergedTitle: ligne(s) en divergence détectée(s)
  viewLineRevisions: Voir l'historique de la ligne
  linesRestore: Restaurer les lignes
  linesRestoreTitle: Restaurer les lignes divergentes
  linesRestoreWarning: Les lignes éditées ou supprimées hors circuit seront réécrites à partir de leur dernière révision vérifiée. Les lignes insérées hors circuit seront supprimées.
  linesRestoreOk: Restauration des lignes lancée
  lineRevisionsTitle: "Historique de la ligne {lineId}"
  lineDeletedRevision: Cette révision correspond à la suppression de la ligne.
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
  fixHelp: Anchors the current state of the file, metadata and, for an editable dataset, each line as the legitimate reference.
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
  op_restore: Restore
  op_delete: Delete
  origin_user: User
  origin_superadmin: Superadmin
  origin_worker: Internal worker
  origin_propagation: Propagation
  origin_upgrade: Upgrade script
  viewDiff: View diff
  downloadPayload: Download historized file
  restore: Restore
  noPayload: not restorable
  diffTitle: "Revision {i} — diff with current state"
  noDiff: No metadata difference with the current state.
  diffRevision: Revision
  diffCurrent: Current state
  restoreTitle: "Restore revision {i}"
  restoreWarning: Covered metadata and the data file will be restored to this revision's state. A differing file triggers a full reprocessing of the dataset.
  restoreReason: Reason (optional, recorded in the history)
  cancel: Cancel
  close: Close
  restoreOk: Restore started
  linesAnchored: anchored lines
  linesPending: lines pending anchoring
  linesOverGate: This dataset exceeds the recommended line count for integrity tracking — anchoring continues but checks and lock renewals are costly.
  linesDivergedTitle: diverging line(s) detected
  viewLineRevisions: View line history
  linesRestore: Restore lines
  linesRestoreTitle: Restore diverging lines
  linesRestoreWarning: Lines edited or deleted out of band will be rewritten from their last verified revision. Lines inserted out of band will be deleted.
  linesRestoreOk: Line restore started
  lineRevisionsTitle: "History of line {lineId}"
  lineDeletedRevision: This revision corresponds to the line's deletion.
</i18n>

<script setup lang="ts">
import { mdiShieldRefresh, mdiWrench, mdiFileCompare, mdiDownload, mdiBackupRestore, mdiHistory } from '@mdi/js'
import type { Dataset } from '#api/types'

const { t, locale } = useI18n()
const datasetStore = useDatasetStore()
const { dataset } = datasetStore
const session = useSession()
// the panel (status + revision history) is visible to the owner's admins; the enable/disable and
// check/fix write actions stay superadmin-only
const adminMode = computed(() => !!session.state.user?.adminMode)

// `lines` (anchored/pending/overGate) is computed on the fly by GET _integrity for enrolled REST
// datasets — it is not part of the stored/public Dataset schema, hence the local extension
type IntegrityState = NonNullable<Dataset['integrity']> & { lines?: { anchored: number, pending: number, overGate?: boolean } }
type RevisionEntry = { i: number, hash: { md5?: string, sha256?: string }, date: string, operation: string, origin: string, reason?: string, hasPayload?: boolean, fileSize?: number }
type RevisionDetail = { i: number, hash: { md5?: string, sha256?: string }, context: any, payload: { metadata: Record<string, any>, file?: { size: number } }, current?: Record<string, any> }
type LineRevisionEntry = { i: number, sha256?: string, deleted?: boolean, date: string, operation: string, origin: string, reason?: string, hasPayload: boolean }
type LineRevisionDetail = { i: number, hash: { sha256?: string }, context: any, line: { _id: string, _i: number, _updatedAt?: string, deleted?: boolean }, payload?: Record<string, any>, current?: Record<string, any> }

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
  { title: t('colHash'), key: 'hash', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const }
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

// backfill progress (target 3, enrolled REST datasets): while lines are pending anchoring, poll
// the lightweight summary every ~2s so the progress indicator reflects the relay draining, then
// stop — no full `load.execute()` here, that would also reset the revision history page
let linesPollTimer: ReturnType<typeof setInterval> | undefined
const stopLinesPoll = () => {
  if (linesPollTimer) {
    clearInterval(linesPollTimer)
    linesPollTimer = undefined
  }
}
const pollLinesSummary = async () => {
  if (!dataset.value) return
  const fresh = await $fetch<IntegrityState>(`datasets/${dataset.value.id}/_integrity`)
  if (state.value) state.value.lines = fresh.lines
}
watch(() => state.value?.lines?.pending, (pending) => {
  if (pending && pending > 0) {
    if (!linesPollTimer) linesPollTimer = setInterval(pollLinesSummary, 2000)
  } else {
    stopLinesPoll()
  }
}, { immediate: true })
onUnmounted(stopLinesPoll)

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

const computeDiffKeys = (snapshot: Record<string, any> | undefined, current: Record<string, any> | undefined): string[] => {
  if (!snapshot || !current) return []
  return [...new Set([...Object.keys(snapshot), ...Object.keys(current)])]
    .filter(k => JSON.stringify(snapshot[k]) !== JSON.stringify(current[k])).sort()
}

const diffOpen = ref(false)
const diffData = ref<RevisionDetail | null>(null)
const pretty = (v: any) => v === undefined ? '—' : JSON.stringify(v, null, 2)
const diffKeys = computed(() => {
  if (!diffData.value) return []
  return computeDiffKeys(diffData.value.payload.metadata, diffData.value.current)
})
const openDiff = useAsyncAction(async (i: number) => {
  diffData.value = await $fetch<RevisionDetail>(`datasets/${dataset.value!.id}/_integrity/revisions/${i}`)
  diffOpen.value = true
})

const restoreTarget = ref<number | null>(null)
const restoreReason = ref('')
const restore = useAsyncAction(async () => {
  const body: any = { i: restoreTarget.value }
  if (restoreReason.value) body.reason = restoreReason.value
  const res = await $fetch<{ status: string }>(`datasets/${dataset.value!.id}/_integrity/_restore`, { method: 'POST', body })
  restoreTarget.value = null
  await load.execute()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
  return res
}, { success: t('restoreOk') })

// Target 3: restore every diverged line to its last verified state. The endpoint drains the
// relay and re-checks synchronously, responding with the fresh verdict — swap it straight into
// `state.lastCheck` (lighter than a full `load.execute()`, which would also reset the revision
// history page); the dataset-level breach badge is still refreshed from the dataset doc.
const linesRestoreDialog = ref(false)
const linesRestoreReason = ref('')
const linesRestore = useAsyncAction(async () => {
  const body: any = {}
  if (linesRestoreReason.value) body.reason = linesRestoreReason.value
  const res = await $fetch<NonNullable<IntegrityState['lastCheck']>>(`datasets/${dataset.value!.id}/_integrity/lines/_restore`, { method: 'POST', body })
  linesRestoreDialog.value = false
  linesRestoreReason.value = ''
  if (state.value) state.value.lastCheck = res
  await pollLinesSummary()
  datasetStore.datasetFetch.refresh() // the breach badge and tab color derive from the dataset doc
  return res
}, { success: t('linesRestoreOk') })

// Target 3 (read side): per-line revision history, the lines counterpart of the dataset-level
// history table + diff dialog above — same pattern, `payload`/`current` are flat line bodies here
// instead of `{ metadata }` objects.
const lineRevisionsOpen = ref(false)
const lineRevisionsLineId = ref<string | null>(null)
const lineRevisionsSize = 10
const lineRevisionsPage = ref(1)
const lineRevisions = ref<LineRevisionEntry[]>([])
const lineRevisionsCount = ref(0)

const lineRevisionHeaders = computed(() => [
  { title: t('colIndex'), key: 'i', width: 60 },
  { title: t('colOperation'), key: 'operation', sortable: false },
  { title: t('colDate'), key: 'date', sortable: false },
  { title: t('colOriginator'), key: 'origin', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const }
])

const loadLineRevisions = useAsyncAction(async () => {
  if (!dataset.value || !lineRevisionsLineId.value) return
  const res = await $fetch<{ count: number, results: LineRevisionEntry[] }>(
    `datasets/${dataset.value.id}/_integrity/lines/${encodeURIComponent(lineRevisionsLineId.value)}/revisions`,
    { params: { size: lineRevisionsSize, page: lineRevisionsPage.value } }
  )
  lineRevisions.value = res.results
  lineRevisionsCount.value = res.count
})

const openLineRevisions = (lineId: string) => {
  lineRevisionsLineId.value = lineId
  lineRevisionsPage.value = 1
  lineRevisionsOpen.value = true
  loadLineRevisions.execute()
}

const lineDiffOpen = ref(false)
const lineDiffData = ref<LineRevisionDetail | null>(null)
const lineDiffKeys = computed(() => {
  if (!lineDiffData.value) return []
  return computeDiffKeys(lineDiffData.value.payload ?? {}, lineDiffData.value.current)
})
const openLineDiff = useAsyncAction(async (i: number) => {
  if (!dataset.value || !lineRevisionsLineId.value) return
  lineDiffData.value = await $fetch<LineRevisionDetail>(`datasets/${dataset.value.id}/_integrity/lines/${encodeURIComponent(lineRevisionsLineId.value)}/revisions/${i}`)
  lineDiffOpen.value = true
})

defineExpose({ load })
</script>
