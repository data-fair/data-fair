<template>
  <v-dialog
    v-model="showDialog"
    max-width="700"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card
      :title="t('title')"
      :loading="save.loading.value || unflag.loading.value"
    >
      <v-card-text>
        <template v-if="resource.partOf">
          <v-alert
            type="info"
            variant="outlined"
            density="compact"
          >
            <i18n-t
              keypath="currentParent"
              tag="span"
            >
              <template #title>
                <router-link :to="parentLink">
                  {{ resource.partOf.title ?? resource.partOf.id }}
                </router-link>
              </template>
            </i18n-t>
          </v-alert>
        </template>

        <template v-else>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ isDataset ? t('descriptionDataset') : t('descriptionApplication') }}
          </p>

          <v-progress-linear
            v-if="candidatesLoading"
            indeterminate
          />
          <v-alert
            v-else-if="candidates.length === 0"
            type="info"
            variant="outlined"
            density="compact"
          >
            {{ isDataset ? t('noCandidateDataset') : t('noCandidateApplication') }}
          </v-alert>
          <v-alert
            v-else-if="candidates.length > 1"
            type="warning"
            variant="outlined"
            density="compact"
          >
            {{ isDataset ? t('tooManyCandidatesDataset') : t('tooManyCandidatesApplication') }}
            <ul class="mt-1">
              <li
                v-for="candidate in candidates"
                :key="candidate.id"
              >
                {{ candidate.title }}
              </li>
            </ul>
          </v-alert>
          <v-alert
            v-else
            type="info"
            variant="outlined"
            density="compact"
          >
            {{ t(isDataset ? 'singleCandidateDataset' : 'singleCandidateApplication', { title: candidates[0].title }) }}
          </v-alert>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="save.loading.value || unflag.loading.value"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          v-if="resource.partOf"
          color="warning"
          variant="flat"
          :disabled="save.loading.value"
          :loading="unflag.loading.value"
          @click="unflag.execute()"
        >
          {{ t('unflag') }}
        </v-btn>
        <v-btn
          v-if="!resource.partOf"
          color="warning"
          variant="flat"
          :disabled="candidates.length !== 1"
          :loading="save.loading.value"
          @click="save.execute()"
        >
          {{ t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Ressource parente
  descriptionDataset: Si ce jeu de données n'existe que pour servir une ressource parente (un jeu de données virtuel dont il est l'unique membre, ou une application qui l'utilise seule), vous pouvez le définir comme enfant. Il sera alors masqué des listes par défaut.
  descriptionApplication: Si cette application n'existe que pour servir une application parente qui l'utilise seule (par exemple un tableau de bord), vous pouvez la définir comme enfant. Elle sera alors masquée des listes par défaut.
  currentParent: "Actuellement défini comme enfant de : {title}"
  noCandidateDataset: Ce jeu de données n'est utilisé par aucun jeu de données virtuel ni aucune application, il est donc impossible de le définir comme enfant.
  noCandidateApplication: Cette application n'est utilisée par aucune autre application, il est donc impossible de la définir comme enfant.
  tooManyCandidatesDataset: Ce jeu de données est utilisé par plusieurs ressources à la fois, ce qui rend la relation ambigüe. Retirez-en pour n'en garder qu'une seule si vous souhaitez le définir comme enfant.
  tooManyCandidatesApplication: Cette application est utilisée par plusieurs applications à la fois, ce qui rend la relation ambigüe. Retirez-en pour n'en garder qu'une seule si vous souhaitez la définir comme enfant.
  singleCandidateDataset: "Ce jeu de données n'est utilisé que par : {title}. Le définir comme son enfant ?"
  singleCandidateApplication: "Cette application n'est utilisée que par : {title}. La définir comme son enfant ?"
  unflag: Retirer l'attribut enfant
  cancel: Annuler
  confirm: Définir comme enfant
  successMsg: Ressource parente enregistrée avec succès
  unflagSuccessMsg: Attribut enfant retiré avec succès
  errorMsg: Échec de la mise à jour de la ressource parente
en:
  title: Parent resource
  descriptionDataset: If this dataset only exists to serve a parent resource (a virtual dataset it is the sole member of, or an application that solely uses it), you can define it as a child. It will then be hidden from default lists.
  descriptionApplication: If this application only exists to serve a parent application that solely uses it (e.g. a dashboard), you can define it as a child. It will then be hidden from default lists.
  currentParent: "Currently defined as a child of: {title}"
  noCandidateDataset: This dataset is not used by any virtual dataset nor any application, so it cannot be defined as a child.
  noCandidateApplication: This application is not used by any other application, so it cannot be defined as a child.
  tooManyCandidatesDataset: This dataset is used by several resources at once, which makes the relationship ambiguous. Remove some so that only one remains if you want to define it as a child.
  tooManyCandidatesApplication: This application is used by several applications at once, which makes the relationship ambiguous. Remove some so that only one remains if you want to define it as a child.
  singleCandidateDataset: "This dataset is only used by: {title}. Define it as its child?"
  singleCandidateApplication: "This application is only used by: {title}. Define it as its child?"
  unflag: Remove the child attribute
  cancel: Cancel
  confirm: Define as child
  successMsg: Parent resource successfully saved
  unflagSuccessMsg: Child attribute successfully removed
  errorMsg: Failed to update the parent resource
</i18n>

<script setup lang="ts">
// candidates are built by the caller from freshly fetched resources, title is always populated
type Candidate = { type: 'dataset' | 'application', id: string, title: string }
// the currently stored partOf comes straight from the resource's generated type, `title` is optional in the schema
type CurrentPartOf = { type: 'dataset' | 'application', id: string, title?: string }

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string, partOf?: CurrentPartOf | null }
  candidates: Candidate[]
  candidatesLoading?: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })

const isDataset = computed(() => props.resourceType === 'datasets')

// the detail routes are the singular of the resource type, which is exactly what partOf.type holds
const parentLink = computed(() => `/${props.resource.partOf?.type}/${props.resource.partOf?.id}`)

const save = useAsyncAction(
  async () => {
    const [candidate] = props.candidates
    if (!candidate) return
    await $fetch(`${props.resourceType}/${props.resource.id}`, {
      method: 'PATCH',
      body: { partOf: candidate }
    })
    showDialog.value = false
    emit('changed')
  },
  { success: t('successMsg'), error: t('errorMsg') }
)

const unflag = useAsyncAction(
  async () => {
    await $fetch(`${props.resourceType}/${props.resource.id}`, {
      method: 'PATCH',
      body: { partOf: null }
    })
    showDialog.value = false
    emit('changed')
  },
  { success: t('unflagSuccessMsg'), error: t('errorMsg') }
)
</script>
