<template>
  <v-list
    v-if="remoteService"
    density="compact"
    class="list-actions"
  >
    <v-list-item
      v-if="remoteService.apiDoc?.externalDocs?.url"
      :href="remoteService.apiDoc.externalDocs.url"
      target="_blank"
      :prepend-icon="mdiInformation"
      :title="t('externalDoc')"
    />

    <v-list-item
      :href="`/data-fair/remote-service/${remoteService.id}/api-doc`"
      target="_top"
      :title="t('useAPI')"
    >
      <template #prepend>
        <v-icon
          color="primary"
          :icon="mdiCloud"
        />
      </template>
    </v-list-item>

    <v-list-item
      v-if="remoteService.url"
      color="admin"
      :disabled="refresh.loading.value"
      :prepend-icon="mdiRefresh"
      :title="t('updateAPI')"
      @click="refresh.execute()"
    />

    <!--
    <v-menu
      :close-on-content-click="false"
      max-width="500"
    >
      <template #activator="{ props }">
        <v-list-item
          v-bind="props"
          :loading="confirmDelete.loading.value"
          :disabled="confirmDelete.loading.value"
          :prepend-icon="mdiDelete"
          :title="t('delete')"
        >
          <template #prepend>
            <v-icon
              color="warning"
              :icon="mdiCloud"
            />
          </template>
        </v-list-item>
      </template>
      <template #default="{ isActive }">
        <v-card
          variant="elevated"
          :title="t('deleteTitle')"
          :text="t('deleteMsg', {title: remoteService.title})"
          :loading="confirmDelete.loading.value ? 'warning' : undefined"
        >
          <v-card-actions>
            <v-spacer />
            <v-btn
              :disabled="confirmDelete.loading.value"
              @click="isActive.value = false"
            >
              {{ t('no') }}
            </v-btn>
            <v-btn
              color="warning"
              variant="flat"
              :loading="confirmDelete.loading.value"
              @click="confirmDelete.execute()"
            >
              {{ t('yes') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </template>
    </v-menu>
    -->
  </v-list>
</template>

<i18n lang="yaml">
fr:
  externalDoc: Documentation externe
  useAPI: Utiliser l'API
  updateAPI: Mettre a jour la description de l'API
  delete: Supprimer
  deleteTitle: Suppression de la configuration du service
  deleteMsg: Voulez vous vraiment supprimer la configuration du service "{title}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
  yes: Oui
  no: Non
  refreshOk: La définition de l'API a été mise à jour
en:
  externalDoc: External documentation
  useAPI: Use API
  updateAPI: Update API description
  delete: Delete
  deleteTitle: Delete the service configuration
  deleteMsg: Do you really want to delete the service configuration "{title}" ? Deletion is definitive.
  yes: Yes
  no: No
  refreshOk: The API definition was updated
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'
import { mdiCloud, mdiInformation, mdiRefresh } from '@mdi/js'

const remoteService = defineModel<RemoteService>()

const { t } = useI18n()

/*
const router = useRouter()
const confirmDelete = useAsyncAction(async () => {
  await $fetch(`remote-services/${remoteService.value!.id}`, { method: 'DELETE' })
  router.push({ path: '/remote-services' })
})
*/

const refresh = useAsyncAction(async () => {
  remoteService.value!.apiDoc = await $fetch(remoteService.value!.url!)
}, { success: t('refreshOk') })

</script>

<style>
</style>
