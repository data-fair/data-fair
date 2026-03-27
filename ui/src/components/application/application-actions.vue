<template>
  <v-list
    v-if="application"
    density="compact"
    bg-color="background"
  >
    <v-list-subheader>{{ t('actions') }}</v-list-subheader>

    <v-list-item
      :href="applicationLink"
      target="_blank"
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiExitToApp"
        />
      </template>
      <v-list-item-title>{{ t('fullPage') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('writeConfig')"
      :to="`/application/${application.id}/config`"
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiSquareEditOutline"
        />
      </template>
      <v-list-item-title>{{ t('editConfig') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc')"
      :to="`/application/${application.id}/api-doc`"
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiCloud"
        />
      </template>
      <v-list-item-title>{{ t('useAPI') }}</v-list-item-title>
    </v-list-item>

    <application-capture-dialog>
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon
              color="primary"
              :icon="mdiCamera"
            />
          </template>
          <v-list-item-title>{{ t('capture') }}</v-list-item-title>
        </v-list-item>
      </template>
    </application-capture-dialog>

    <owner-change-dialog
      v-if="can('setOwner')"
      :resource="application"
      resource-type="applications"
      @changed="router.push('/applications')"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon
              color="admin"
              :icon="mdiAccountSwitch"
            />
          </template>
          <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
        </v-list-item>
      </template>
    </owner-change-dialog>

    <v-list-item
      v-if="can('writeDescriptionBreaking')"
      @click="showSlugDialog = true"
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiPencil"
        />
      </template>
      <v-list-item-title>{{ t('editSlug') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('delete')"
      @click="showDeleteDialog = true"
    >
      <template #prepend>
        <v-icon
          color="warning"
          :icon="mdiDelete"
        />
      </template>
      <v-list-item-title>{{ t('delete') }}</v-list-item-title>
    </v-list-item>
  </v-list>

  <v-dialog
    v-model="showDeleteDialog"
    max-width="500"
  >
    <v-card>
      <v-card-title>{{ t('deleteApp') }}</v-card-title>
      <v-card-text>{{ t('deleteMsg', { title: application?.title }) }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDeleteDialog = false"
        >
          {{ t('no') }}
        </v-btn>
        <v-btn
          color="warning"
          @click="confirmRemove"
        >
          {{ t('yes') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="showSlugDialog"
    max-width="500"
    @update:model-value="val => { if (val) newSlug = application?.slug ?? '' }"
  >
    <v-card>
      <v-card-title>{{ t('editSlug') }}</v-card-title>
      <v-card-text>
        <v-alert
          type="warning"
          variant="outlined"
          class="mb-4"
        >
          {{ t('slugWarning') }}
        </v-alert>
        <v-text-field
          v-model="newSlug"
          :label="t('newSlug')"
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
          @click="showSlugDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          :disabled="newSlug === application?.slug || !newSlug || !newSlug.match(slugRegex)"
          @click="confirmSlug"
        >
          {{ t('validate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  actions: ACTIONS
  capture: Capture d'écran
  fullPage: Ouvrir en pleine page
  editConfig: Éditer la configuration
  useAPI: Utiliser l'API
  changeOwner: Changer le propriétaire
  editSlug: Modifier l'identifiant
  slugWarning: Cet identifiant unique et lisible est utilisé dans les URLs de pages de portails, d'APIs de données, etc. Attention, si vous le modifiez vous pouvez casser des liens et des applications existantes.
  newSlug: Nouvel identifiant
  cancel: Annuler
  validate: Valider
  delete: Supprimer
  deleteApp: Suppression de l'application
  deleteMsg: Voulez vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérée.
  yes: Oui
  no: Non
en:
  actions: ACTIONS
  capture: Screenshot
  fullPage: Open in a fullscreen
  editConfig: Edit configuration
  useAPI: Use the API
  changeOwner: Change owner
  editSlug: Edit slug
  slugWarning: "This unique and readable id is used in portal pages URLs, data APIs, etc. Warning: if you modify it you can break existing links and applications."
  newSlug: New slug
  cancel: Cancel
  validate: Validate
  delete: Delete
  deleteApp: Deletion of the application
  deleteMsg: Do you really want to delete the application "{title}" ? Deletion is definitive and application configuration will not be recoverable.
  yes: Yes
  no: No
</i18n>

<script lang="ts" setup>
import { mdiAccountSwitch, mdiCamera, mdiCloud, mdiDelete, mdiExitToApp, mdiPencil, mdiSquareEditOutline } from '@mdi/js'
import useApplicationStore from '~/composables/application-store'

const { t } = useI18n()
const router = useRouter()
const { application, applicationLink, can, patch, remove } = useApplicationStore()

const showDeleteDialog = ref(false)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/applications')
}

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const showSlugDialog = ref(false)
const newSlug = ref('')

const confirmSlug = async () => {
  showSlugDialog.value = false
  await patch({ slug: newSlug.value })
}
</script>
