<template>
  <card-shell
    :title="application.title || application.id"
    :to="`/application/${application.id}`"
    :owner="showOwner ? application.owner : undefined"
    :omit-owner-name="!showAll"
  >
    <!-- Application capture -->
    <template #media>
      <v-img
        :src="captureUrl"
        :aspect-ratio="1050 / 450"
        class="mx-2 mt-3 rounded flex-grow-0"
        cover
      >
        <!-- the capture failed and there is no previous one: data-fair answers an error status -->
        <template #error>
          <div class="d-flex align-center justify-center fill-height bg-surface-light">
            <v-icon
              :icon="mdiImageOffOutline"
              size="48"
            />
          </div>
        </template>
      </v-img>
    </template>

    <!-- Fragment parent -->
    <card-meta-line
      v-if="application.partOf"
      :icon="mdiPuzzle"
      :icon-color="foreign ? 'warning' : 'primary'"
      :text="t('fragmentOf', { title: parentFetch.data.value?.title ?? application.partOf.id })"
    >
      <template
        v-if="foreign"
        #help
      >
        {{ t('foreign') }}
      </template>
    </card-meta-line>

    <!-- Application publications/requested sites -->
    <card-sites
      :sites="sites"
      :requested="requestedSites"
    />

    <!-- Topics chips -->
    <template
      v-if="application.topics?.length"
      #chips
    >
      <v-chip
        v-for="topic of application.topics"
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
        v-if="application.visibility && !application.partOf"
        :visibility="application.visibility"
      />

      <!-- Permissions of the current user -->
      <capability-chip
        v-if="showCapability"
        resource-type="applications"
        :user-permissions="cardUserPermissions"
        :access-sources="cardAccessSources"
      />

      <!-- Modification and creation dates -->
      <card-dates
        v-if="application.updatedAt"
        :updated-at="application.updatedAt"
        :created-at="application.createdAt"
      />
    </template>
  </card-shell>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'
import { mdiImageOffOutline, mdiPuzzle } from '@mdi/js'
import { foreignReferences, type ReferencingResource } from '~/utils/fragments'

const { t } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const props = defineProps<{
  application: Partial<Application> & Pick<Application, 'id' | 'title' | 'updatedAt' | 'owner'> & { visibility?: 'public' | 'private' | 'protected', thumbnail?: string }
  showCapability?: boolean
  // the resource whose page lists this card as one of its users: flags a fragment used outside of its parent
  usedBy?: ReferencingResource
}>()

const showOwner = computed(() => showAll.value || !!(props.application.owner?.department && !session.state.account?.department))
const cardUserPermissions = computed(() => (props.application as Application & { userPermissions?: string[] }).userPermissions)
const cardAccessSources = computed(() => (props.application as Application & { accessSources?: AccessSources }).accessSources)
const foreign = computed(() => !!props.application.partOf && !!props.usedBy && foreignReferences(props.application.partOf, [props.usedBy]).length > 0)

const captureUrl = computed(() => {
  return props.application.thumbnail || props.application.image || `${props.application.href}/capture?updatedAt=${props.application.updatedAt}`
})

// fragments are rare in a list: their parent title is fetched per card;
// notifError: false — whoever can read the fragment does not necessarily hold readDescription on its parent
const parentFetch = useFetch<{ title: string }>(() => props.application.partOf ? `${$apiPath}/${props.application.partOf.type}s/${props.application.partOf.id}` : null, { query: { select: 'title' }, notifError: false })

const sitesById = usePublicationSitesById()
const sites = computed(() => (props.application.publicationSites ?? []).map(id => sitesById.value[id]).filter(Boolean))
const requestedSites = computed(() => (props.application.requestedPublicationSites ?? []).map(id => sitesById.value[id]).filter(Boolean))
</script>

<i18n lang="yaml">
fr:
  fragmentOf: "Fragment de « {title} »"
  foreign: "Utilisé ici en dehors de son parent : ses accès découlent du parent et il sera supprimé avec lui."
en:
  fragmentOf: "Fragment of \"{title}\""
  foreign: "Used here outside of its parent: its access derives from the parent and it will be deleted with it."
</i18n>
