<template>
  <v-row v-if="dataset">
    <v-col
      cols="12"
      md="6"
      lg="5"
      class="order-md-2"
    >
      <v-sheet>
        <v-list density="compact">
          <v-list-item :prepend-icon="mdiAccount">
            <span>{{ dataset.owner?.name }}</span>
          </v-list-item>

          <v-list-item
            v-if="dataset.file"
            :prepend-icon="mdiFile"
            style="overflow: hidden;"
          >
            <span>{{ (dataset.originalFile || dataset.file).name }} {{ formatBytes((dataset.originalFile || dataset.file).size, locale) }}</span>
          </v-list-item>

          <v-list-item
            :prepend-icon="mdiPencil"
            :title="t('updatedAt')"
          >
            <span>{{ dataset.updatedBy?.name }} {{ formatDate(dataset.updatedAt) }}</span>
          </v-list-item>

          <v-list-item
            v-if="dataset.dataUpdatedAt"
            :prepend-icon="dataset.isRest ? mdiPlaylistEdit : mdiUpload"
            :title="t('dataUpdatedAt')"
          >
            <span>{{ dataset.dataUpdatedBy?.name }} {{ formatDate(dataset.dataUpdatedAt) }}</span>
          </v-list-item>

          <v-list-item :prepend-icon="mdiPlusCircleOutline">
            <span>{{ dataset.createdBy?.name }} {{ formatDate(dataset.createdAt) }}</span>
          </v-list-item>

          <v-list-item
            v-if="dataset.count !== undefined"
            :prepend-icon="mdiViewHeadline"
          >
            <span>{{ t('lines', dataset.count) }}</span>
          </v-list-item>

          <!-- REST dataset indicators -->
          <template v-if="dataset.isRest">
            <v-list-item :prepend-icon="mdiAllInclusive">
              <span>{{ t('restDataset') }}</span>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon :color="dataset.rest?.history ? undefined : 'grey'">
                  {{ mdiHistory }}
                </v-icon>
              </template>
              <span v-if="dataset.rest?.history">{{ t('history') }}</span>
              <span v-else>{{ t('noHistory') }}</span>
              <template #append>
                <dataset-edit-history
                  v-if="can('writeDescriptionBreaking')"
                  :history="dataset.rest?.history"
                  @change="history => { if (dataset.rest) dataset.rest.history = history }"
                />
              </template>
            </v-list-item>

            <v-list-item v-if="dataset.rest?.history">
              <template #prepend>
                <v-icon :color="dataset.rest?.historyTTL?.active ? 'warning' : 'grey'">
                  {{ mdiDeleteClock }}
                </v-icon>
              </template>
              <span v-if="dataset.rest?.historyTTL?.active">{{ t('historyTTL', { days: dataset.rest.historyTTL.delay?.value }) }}</span>
              <span v-else>{{ t('noHistoryTTL') }}</span>
              <template #append>
                <dataset-edit-ttl
                  v-if="can('writeDescriptionBreaking')"
                  :ttl="dataset.rest?.historyTTL"
                  :schema="dataset.schema"
                  :revisions="true"
                  @change="ttl => { if (dataset.rest) dataset.rest.historyTTL = ttl }"
                />
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon :color="dataset.rest?.ttl?.active ? 'warning' : 'grey'">
                  {{ mdiDeleteRestore }}
                </v-icon>
              </template>
              <span v-if="dataset.rest?.ttl?.active">{{ t('ttl', { col: dataset.rest.ttl.prop, days: dataset.rest.ttl.delay?.value }) }}</span>
              <span v-else>{{ t('noTTL') }}</span>
              <template #append>
                <dataset-edit-ttl
                  v-if="can('writeDescriptionBreaking')"
                  :ttl="dataset.rest?.ttl"
                  :schema="dataset.schema"
                  @change="ttl => { if (dataset.rest) dataset.rest.ttl = ttl }"
                />
              </template>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon :color="dataset.rest?.storeUpdatedBy ? 'warning' : 'grey'">
                  {{ mdiAccountDetails }}
                </v-icon>
              </template>
              <span v-if="dataset.rest?.storeUpdatedBy">{{ t('storeUpdatedBy') }}</span>
              <span v-else>{{ t('noStoreUpdatedBy') }}</span>
              <template #append>
                <dataset-edit-store-updated-by
                  v-if="can('writeDescriptionBreaking')"
                  :store-updated-by="dataset.rest?.storeUpdatedBy"
                  @change="val => { if (dataset.rest) dataset.rest.storeUpdatedBy = val }"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-sheet>

      <v-select
        v-model="dataset.license"
        :items="licensesFetch.data.value ?? []"
        :disabled="!can('writeDescription')"
        item-title="title"
        item-value="href"
        :label="t('licence')"
        return-object
        hide-details
        class="mb-3"
        clearable
      />

      <v-select
        v-if="topicsFetch.data.value?.length"
        v-model="dataset.topics"
        :items="topicsFetch.data.value ?? []"
        :disabled="!can('writeDescription')"
        item-title="title"
        item-value="id"
        :label="t('topics')"
        multiple
        return-object
        hide-details
        class="mb-3"
      />

      <v-combobox
        v-model="dataset.keywords"
        :disabled="!can('writeDescription')"
        :label="t('keywords')"
        hide-details
        multiple
        chips
        closable-chips
        class="mb-3"
      />

      <v-text-field
        v-model="dataset.origin"
        :disabled="!can('writeDescription')"
        :label="t('origin')"
        hide-details
        class="mb-3"
        clearable
      />

      <v-text-field
        v-model="dataset.image"
        :disabled="!can('writeDescription')"
        :label="t('image')"
        hide-details
        class="mb-3"
        clearable
      />

      <!-- Conditional metadata fields based on owner settings -->
      <v-text-field
        v-if="datasetsMetadata?.projection?.active"
        v-model="dataset.projection"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.projection.title || t('projection')"
        hide-details
        class="mb-3"
        clearable
      />

      <v-text-field
        v-if="datasetsMetadata?.creator?.active"
        v-model="dataset.creator"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.creator.title || t('creator')"
        hide-details
        class="mb-3"
        clearable
        :rules="props.required.includes('creator') ? [(val: string) => !!val] : []"
      />

      <v-select
        v-if="datasetsMetadata?.frequency?.active"
        v-model="dataset.frequency"
        :items="frequencies"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.frequency.title || t('frequency')"
        hide-details
        clearable
        class="mb-3"
      />

      <v-text-field
        v-if="datasetsMetadata?.spatial?.active"
        v-model="dataset.spatial"
        :disabled="!can('writeDescription')"
        :label="datasetsMetadata.spatial.title || t('spatial')"
        hide-details
        class="mb-3"
        clearable
      />

      <v-text-field
        v-if="datasetsMetadata?.temporal?.active"
        :model-value="formatTemporal(dataset.temporal)"
        readonly
        :label="datasetsMetadata.temporal.title || t('temporal')"
        hide-details
        class="mb-3"
        clearable
        @click:clear="dataset.temporal = null"
      >
        <template #append-inner>
          <v-menu
            v-model="temporalMenu"
            :close-on-content-click="false"
          >
            <template #activator="{ props: menuProps }">
              <v-icon v-bind="menuProps">
                mdi-calendar
              </v-icon>
            </template>
            <v-date-picker
              :model-value="temporalDates"
              multiple
              @update:model-value="setTemporalDates"
            />
          </v-menu>
        </template>
      </v-text-field>

      <v-text-field
        v-if="datasetsMetadata?.modified?.active"
        :model-value="dataset.modified ? formatDate(dataset.modified) : ''"
        readonly
        :label="datasetsMetadata.modified.title || t('modified')"
        hide-details
        class="mb-3"
        clearable
        @click:clear="dataset.modified = null"
      >
        <template #append-inner>
          <v-menu
            v-model="modifiedMenu"
            :close-on-content-click="false"
          >
            <template #activator="{ props: menuProps }">
              <v-icon v-bind="menuProps">
                mdi-calendar
              </v-icon>
            </template>
            <v-date-picker
              :model-value="dataset.modified ? [dataset.modified] : []"
              @update:model-value="dates => { dataset.modified = dates[0] || null; modifiedMenu = false }"
            />
          </v-menu>
        </template>
      </v-text-field>

      <v-checkbox
        v-if="dataset.schema?.some((prop: any) => prop['x-refersTo'] === 'http://schema.org/DigitalDocument')"
        v-model="dataset.attachmentsAsImage"
        :disabled="!can('writeDescriptionBreaking')"
        :label="t('attachmentsAsImage')"
        hide-details
        density="compact"
      />

      <template v-if="datasetsMetadata?.custom?.length">
        <v-text-field
          v-for="cm of datasetsMetadata.custom"
          :key="cm.key"
          :model-value="dataset.customMetadata?.[cm.key]"
          :disabled="!can('writeDescription')"
          :label="cm.title"
          hide-details
          class="mb-3"
          clearable
          @update:model-value="v => setCustomMetadata(cm.key, v)"
        />
      </template>
    </v-col>

    <v-col
      cols="12"
      md="6"
      lg="7"
      class="order-md-1 pt-5"
    >
      <v-text-field
        v-model="dataset.title"
        :disabled="!can('writeDescription')"
        :label="t('title')"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-3"
      />

      <v-textarea
        v-model="dataset.summary"
        :disabled="!can('writeDescription')"
        :label="t('summary')"
        rows="3"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-3"
      />

      <markdown-editor
        v-model="dataset.description"
        :disabled="!can('writeDescription')"
        :label="t('description')"
        :locale="locale"
        :csp-nonce="$cspNonce"
      />

      <v-text-field
        id="slug-input"
        v-model="dataset.slug"
        :readonly="true"
        :disabled="!can('writeDescriptionBreaking')"
        :label="t('slug')"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-3"
      />

      <v-menu
        v-if="can('writeDescriptionBreaking')"
        v-model="slugMenu"
        activator="#slug-input"
        :close-on-content-click="false"
        max-width="700"
        @update:model-value="val => { if (val) newSlug = dataset.slug }"
      >
        <v-card>
          <v-card-title>
            {{ t('slug') }}
          </v-card-title>
          <v-card-text>
            <v-alert
              type="warning"
              variant="outlined"
            >
              {{ t('slugWarning') }}
            </v-alert>
            <v-text-field
              v-model="newSlug"
              :label="t('newSlug')"
              autofocus
              variant="outlined"
              density="compact"
              hide-details
              :rules="[val => !!val, val => !!val?.match(slugRegex)]"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              variant="text"
              @click="slugMenu = false"
            >
              {{ t('cancel') }}
            </v-btn>
            <v-btn
              color="warning"
              :disabled="newSlug === dataset.slug || !newSlug || !newSlug.match(slugRegex)"
              @click="dataset.slug = newSlug; slugMenu = false"
            >
              {{ t('validate') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-menu>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  updatedAt: derniere mise a jour des metadonnees
  dataUpdatedAt: derniere mise a jour des donnees
  lines: aucune ligne | 1 ligne | {count} lignes
  restDataset: Jeu de donnees editable
  ttl: Supprimer automatiquement les lignes dont la colonne {col} contient une date depassee de {days} jours.
  noTTL: pas de politique d'expiration des lignes configuree
  licence: Licence
  topics: Thematiques
  origin: Provenance
  image: Adresse d'une image utilisee comme vignette
  keywords: Mots cles
  slug: Identifiant de publication
  slugWarning: Cet identifiant unique et lisible est utilise dans les URLs de pages de portails, d'APIs de donnees, etc. Attention, si vous le modifiez vous pouvez casser des liens et des applications existantes. Vous ne pouvez utiliser que des lettres minuscules non accentuees, des chiffres et des tirets.
  newSlug: Nouvel identifiant de publication
  title: Titre
  summary: Resume
  description: Description
  history: Historisation (conserve les revisions des lignes)
  noHistory: Pas d'historisation (ne conserve pas les revisions des lignes)
  historyTTL: Supprimer automatiquement les revisions de lignes qui datent de plus de {days} jours.
  noHistoryTTL: pas de politique d'expiration des revisions configuree
  storeUpdatedBy: Stocker l'utilisateur responsable d'une modification de ligne
  noStoreUpdatedBy: Pas de stockage de l'utilisateur responsable d'une modification de ligne
  cancel: Annuler
  validate: Valider
  projection: Système de coordonnées
  creator: Producteur
  frequency: Fréquence de mise à jour
  freq_realtime: Temps réel
  freq_daily: Quotidienne
  freq_weekly: Hebdomadaire
  freq_monthly: Mensuelle
  freq_quarterly: Trimestrielle
  freq_yearly: Annuelle
  freq_irregular: Irrégulière
  spatial: Couverture spatiale
  temporal: Couverture temporelle
  modified: Date de modification de la source
  attachmentsAsImage: Afficher les pièces jointes comme des images
en:
  updatedAt: last update of metadata
  dataUpdatedAt: last update of data
  lines: no line | 1 line | {count} lines
  restDataset: Editable dataset
  ttl: Automatically delete lines whose column {col} contains a date exceeded by {days} days.
  noTTL: no automatic expiration of lines configured
  licence: License
  topics: Topics
  origin: Origin
  image: URL of an image used as thumbnail
  keywords: Keywords
  slug: Publication identifier
  slugWarning: "This unique and readable id is used in portal pages URLs, data APIs, etc. Warning: if you modify it you can break existing links and applications."
  newSlug: New publication identifier
  title: Title
  summary: Summary
  description: Description
  history: History (store revisions of lines)
  noHistory: No history configured (do not store revisions of lines)
  historyTTL: Automatically delete revisions more than {days} days old.
  noHistoryTTL: no automatic expiration of revisions configured
  storeUpdatedBy: Store the user responsible for a line modification
  noStoreUpdatedBy: No storage of the user responsible for a line modification
  cancel: Cancel
  validate: Validate
  projection: Coordinate reference system
  creator: Producer
  frequency: Update frequency
  freq_realtime: Real-time
  freq_daily: Daily
  freq_weekly: Weekly
  freq_monthly: Monthly
  freq_quarterly: Quarterly
  freq_yearly: Yearly
  freq_irregular: Irregular
  spatial: Spatial coverage
  temporal: Temporal coverage
  modified: Source modification date
  attachmentsAsImage: Display attachments as images
</i18n>

<script lang="ts" setup>
import {
  mdiAccount,
  mdiAccountDetails,
  mdiAllInclusive,
  mdiDeleteClock,
  mdiDeleteRestore,
  mdiFile,
  mdiHistory,
  mdiPencil,
  mdiPlaylistEdit,
  mdiPlusCircleOutline,
  mdiUpload,
  mdiViewHeadline
} from '@mdi/js'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import formatBytes from '@data-fair/lib-vue/format/bytes'
import { useDatasetsMetadata } from '~/composables/use-datasets-metadata'

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const slugMenu = ref(false)
const newSlug = ref('')

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const props = withDefaults(defineProps<{
  required?: string[]
}>(), { required: () => [] })

const owner = computed(() => dataset.value?.owner)
const licensesFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/licenses` : null)
const topicsFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

const { datasetsMetadata } = useDatasetsMetadata(owner)

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value)
}

const frequencyKeys = ['realtime', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular'] as const
const frequencies = computed(() => frequencyKeys.map(k => ({ title: t(`freq_${k}`), value: k })))

const temporalMenu = ref(false)
const modifiedMenu = ref(false)

const temporalDates = computed(() => {
  if (!dataset.value?.temporal) return []
  return [dataset.value.temporal.start, dataset.value.temporal.end].filter(Boolean)
})

const formatTemporal = (temporal: any) => {
  if (!temporal) return ''
  const parts = []
  if (temporal.start) parts.push(formatDate(temporal.start))
  if (temporal.end) parts.push(formatDate(temporal.end))
  return parts.join(' — ')
}

const setTemporalDates = (dates: string[]) => {
  if (!dates.length) { dataset.value.temporal = null; return }
  const sorted = [...dates].sort()
  dataset.value.temporal = { start: sorted[0], end: sorted[sorted.length - 1] }
}

const setCustomMetadata = (key: string, value: any) => {
  if (!dataset.value.customMetadata) dataset.value.customMetadata = {}
  if (value) dataset.value.customMetadata[key] = value
  else delete dataset.value.customMetadata[key]
}
</script>
