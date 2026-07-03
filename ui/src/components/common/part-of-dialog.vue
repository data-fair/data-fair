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
            {{ t('currentParent', { title: resource.partOf.title ?? resource.partOf.id }) }}
          </v-alert>
        </template>

        <template v-else>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('description') }}
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
            {{ t('noCandidate') }}
          </v-alert>
          <v-alert
            v-else-if="candidates.length > 1"
            type="warning"
            variant="outlined"
            density="compact"
          >
            {{ t('tooManyCandidates') }}
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
            {{ t('singleCandidate', { title: candidates[0].title }) }}
          </v-alert>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="resource.partOf"
          variant="text"
          color="warning"
          :disabled="save.loading.value"
          :loading="unflag.loading.value"
          @click="unflag.execute()"
        >
          {{ t('unflag') }}
        </v-btn>
        <v-spacer />
        <v-btn
          :disabled="save.loading.value || unflag.loading.value"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          v-if="!resource.partOf"
          color="primary"
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
  description: Si ce jeu de données ou cette application n'existe que pour servir une ressource parente (un jeu de données virtuel dont il est l'unique membre, ou une application qui l'utilise seule), vous pouvez le/la définir comme enfant. Il/elle sera alors masqué(e) des listes par défaut.
  currentParent: "Actuellement défini comme enfant de : {title}"
  noCandidate: Ce jeu de données ou cette application n'est utilisé(e) par aucun jeu de données virtuel ni aucune application, il est donc impossible de le/la définir comme enfant.
  tooManyCandidates: Ce jeu de données ou cette application est utilisé(e) par plusieurs ressources à la fois, ce qui rend la relation ambigüe. Retirez-en pour n'en garder qu'une seule si vous souhaitez le/la définir comme enfant.
  singleCandidate: "Ce jeu de données ou cette application n'est utilisé(e) que par : {title}. Le/la définir comme son enfant ?"
  unflag: Retirer l'attribut enfant
  cancel: Annuler
  confirm: Confirmer
  successMsg: Ressource parente enregistrée avec succès
  unflagSuccessMsg: Attribut enfant retiré avec succès
  errorMsg: Échec de la mise à jour de la ressource parente
en:
  title: Parent resource
  description: If this dataset or application only exists to serve a parent resource (a virtual dataset it is the sole member of, or an application that solely uses it), you can define it as a child. It will then be hidden from default lists.
  currentParent: "Currently defined as a child of: {title}"
  noCandidate: This dataset or application is not used by any virtual dataset nor any application, so it cannot be defined as a child.
  tooManyCandidates: This dataset or application is used by several resources at once, which makes the relationship ambiguous. Remove some so that only one remains if you want to define it as a child.
  singleCandidate: "This dataset or application is only used by: {title}. Define it as its child?"
  unflag: Remove the child attribute
  cancel: Cancel
  confirm: Confirm
  successMsg: Parent resource successfully saved
  unflagSuccessMsg: Child attribute successfully removed
  errorMsg: Failed to update the parent resource
</i18n>

<script setup lang="ts">
// candidates are built by the caller from freshly fetched resources, title is always populated
type Candidate = { type: 'dataset' | 'application', id: string, title: string }
// the currently stored partOf comes straight from the resource's generated type: `type` is absent
// for applications (always 'application') and `title` is optional in the schema
type CurrentPartOf = { type?: 'dataset' | 'application', id: string, title?: string }

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  resource: { id: string, title: string, partOf?: CurrentPartOf | null }
  candidates: Candidate[]
  candidatesLoading?: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })

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
