<template>
  <card-shell
    :title="dataset.title || dataset.id"
    :to="noLink ? undefined : `/dataset/${dataset.id}`"
    :owner="showOwner ? dataset.owner : undefined"
    :omit-owner-name="!showAll"
  >
    <!-- Dataset type and line count -->
    <div
      class="d-flex ga-4"
      style="min-width: 0"
    >
      <!-- the type stays whole, the line count is the one truncated on a narrow card -->
      <span class="d-flex flex-shrink-0">
        <card-meta-line
          :icon="type.icon"
          color="primary"
          :text="t(type.label)"
        />
      </span>
      <card-meta-line
        v-if="dataset.count != null"
        :icon="mdiViewHeadline"
        :text="t('lines', { count: dataset.count.toLocaleString(locale) }, dataset.count)"
      />
    </div>

    <!-- Dataset status -->
    <card-meta-line
      v-if="dataset.status === 'draft'"
      :icon="mdiProgressWrench"
      color="warning"
      :text="t('draft')"
    />
    <card-meta-line
      v-if="dataset.status === 'error'"
      :icon="mdiAlert"
      color="error"
      :text="t('error')"
    />

    <!-- Fragment parent -->
    <card-meta-line
      v-if="dataset.partOf"
      :icon="mdiPuzzle"
      :icon-color="foreign ? 'warning' : 'primary'"
      :text="t('fragmentOf', { title: parentFetch.data.value?.title ?? dataset.partOf.id })"
    >
      <template
        v-if="foreign"
        #help
      >
        {{ t('foreign') }}
      </template>
    </card-meta-line>

    <!-- Dataset publications/requested sites -->
    <card-sites
      :sites="sites"
      :requested="requestedSites"
    />

    <!-- Topics chips -->
    <template
      v-if="dataset.topics?.length"
      #chips
    >
      <v-chip
        v-for="topic of dataset.topics"
        :key="topic.id ?? topic.title"
        :color="topic.color"
        :text="topic.title"
        class="font-weight-bold"
        density="compact"
        size="small"
        variant="flat"
      />
    </template>

    <template #footer>
      <!-- a fragment gets its access from its parent, already named in the card -->
      <card-visibility
        v-if="dataset.visibility && !dataset.partOf"
        :visibility="dataset.visibility"
      />

      <!-- Permissions of the current user -->
      <capability-chip
        v-if="showCapability"
        resource-type="datasets"
        :user-permissions="cardUserPermissions"
        :access-sources="cardAccessSources"
      />

      <!-- Modification, data and creation dates -->
      <card-dates
        v-if="dataset.updatedAt"
        :updated-at="dataset.updatedAt"
        :data-updated-at="dataset.dataUpdatedAt"
        :created-at="dataset.createdAt"
      />

      <!-- Completeness score, on the right -->
      <v-spacer />
      <dataset-completeness-info
        v-if="dataset.completeness"
        :completeness="dataset.completeness"
        :datasets-metadata="datasetsMetadata"
        card
      />
    </template>
  </card-shell>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import {
  mdiPictureInPictureBottomRightOutline,
  mdiAllInclusive,
  mdiInformationOutline,
  mdiProgressWrench,
  mdiAlert,
  mdiFile,
  mdiPuzzle,
  mdiViewHeadline,
} from '@mdi/js'
import { foreignReferences, type ReferencingResource } from '~/utils/fragments'

const { t, locale } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const props = withDefaults(defineProps<{
  dataset: Dataset
  noLink?: boolean
  showCapability?: boolean
  // the resource whose page lists this card as one of its users: flags a fragment used outside of its parent
  usedBy?: ReferencingResource
  // settings of the current account, for the labels of the completeness criteria
  datasetsMetadata?: Record<string, any> | null
}>(), {
  noLink: false,
  showCapability: false
})

const showOwner = computed(() => showAll.value || !!(props.dataset.owner?.department && !session.state.account?.department))
const cardUserPermissions = computed(() => (props.dataset as Dataset & { userPermissions?: string[] }).userPermissions)
const cardAccessSources = computed(() => (props.dataset as Dataset & { accessSources?: AccessSources }).accessSources)
const foreign = computed(() => !!props.dataset.partOf && !!props.usedBy && foreignReferences(props.dataset.partOf, [props.usedBy]).length > 0)

const type = computed(() => {
  if (props.dataset.isRest) return { icon: mdiAllInclusive, label: 'editable' }
  if (props.dataset.isVirtual) return { icon: mdiPictureInPictureBottomRightOutline, label: 'virtual' }
  if (props.dataset.isMetaOnly) return { icon: mdiInformationOutline, label: 'metaOnly' }
  return { icon: mdiFile, label: 'file' }
})

// fragments are rare in a list: their parent title is fetched per card;
// notifError: false — whoever can read the fragment does not necessarily hold readDescription on its parent
const parentFetch = useFetch<{ title: string }>(() => props.dataset.partOf ? `${$apiPath}/${props.dataset.partOf.type}s/${props.dataset.partOf.id}` : null, { query: { select: 'title' }, notifError: false })

const sitesById = usePublicationSitesById()
const sites = computed(() => (props.dataset.publicationSites ?? []).map(id => sitesById.value[id]).filter(Boolean))
const requestedSites = computed(() => (props.dataset.requestedPublicationSites ?? []).map(id => sitesById.value[id]).filter(Boolean))
</script>

<i18n lang="yaml">
fr:
  file: Fichier
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon · fichier à valider
  error: Erreur lors du traitement
  lines: "0 ligne | 1 ligne | {count} lignes"
  fragmentOf: "Fragment de « {title} »"
  foreign: "Utilisé ici en dehors de son parent : ses accès découlent du parent et il sera supprimé avec lui."
  completeness: 'Score de complétion des métadonnées : {score} %'
en:
  file: File
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft · file to validate
  error: Processing error
  lines: "0 line | 1 line | {count} lines"
  fragmentOf: "Fragment of \"{title}\""
  foreign: "Used here outside of its parent: its access derives from the parent and it will be deleted with it."
  completeness: 'Metadata completeness score: {score} %'
</i18n>
