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
        <v-icon color="primary">
          mdi-exit-to-app
        </v-icon>
      </template>
      <v-list-item-title>{{ t('fullPage') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('writeConfig')"
      :to="`/application/${application.id}/config`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-square-edit-outline
        </v-icon>
      </template>
      <v-list-item-title>{{ t('editConfig') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc')"
      :to="`/application/${application.id}/api-doc`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-cloud
        </v-icon>
      </template>
      <v-list-item-title>{{ t('useAPI') }}</v-list-item-title>
    </v-list-item>

    <integration-dialog
      resource-type="applications"
      :resource="application"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon color="primary">
              mdi-code-tags
            </v-icon>
          </template>
          <v-list-item-title>{{ t('integration') }}</v-list-item-title>
        </v-list-item>
      </template>
    </integration-dialog>

    <owner-change-dialog
      v-if="can('setOwner')"
      :resource="application"
      resource-type="applications"
      @changed="router.push('/applications')"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon color="admin">
              mdi-account-switch
            </v-icon>
          </template>
          <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
        </v-list-item>
      </template>
    </owner-change-dialog>

    <v-list-item
      v-if="can('delete')"
      @click="showDeleteDialog = true"
    >
      <template #prepend>
        <v-icon color="warning">
          mdi-delete
        </v-icon>
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
</template>

<i18n lang="yaml">
fr:
  actions: ACTIONS
  fullPage: Ouvrir en pleine page
  editConfig: Éditer la configuration
  useAPI: Utiliser l'API
  integration: Intégrer dans un site
  changeOwner: Changer le propriétaire
  delete: Supprimer
  deleteApp: Suppression de l'application
  deleteMsg: Voulez vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérée.
  yes: Oui
  no: Non
en:
  actions: ACTIONS
  fullPage: Open in a fullscreen
  editConfig: Edit configuration
  useAPI: Use the API
  integration: Embed in a website
  changeOwner: Change owner
  delete: Delete
  deleteApp: Deletion of the application
  deleteMsg: Do you really want to delete the application "{title}" ? Deletion is definitive and application configuration will not be recoverable.
  yes: Yes
  no: No
</i18n>

<script lang="ts" setup>
import useApplicationStore from '~/composables/application-store'

const { t } = useI18n()
const router = useRouter()
const { application, applicationLink, can, remove } = useApplicationStore()

const showDeleteDialog = ref(false)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/applications')
}
</script>
