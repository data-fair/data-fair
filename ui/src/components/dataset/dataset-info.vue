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

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const slugMenu = ref(false)
const newSlug = ref('')

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const owner = computed(() => dataset.value?.owner)
const licensesFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/licenses` : null)
const topicsFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>
