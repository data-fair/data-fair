<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card
      :title="t('changeOwnerTitle')"
      :loading="changeOwner.loading.value"
    >
      <v-card-text>
        <df-owner-pick
          v-model="newOwner"
          :hide-single="false"
          hide-message
          other-accounts
        />
        <v-alert
          v-if="childrenCount > 0"
          type="info"
          variant="outlined"
          density="compact"
          class="mt-4"
        >
          {{ t('childrenWarning', childrenCount) }}
        </v-alert>
        <v-alert
          type="warning"
          variant="outlined"
          class="mt-4"
        >
          <p>{{ t('warningIntro') }}</p>
          <ul class="ml-5">
            <li>{{ t('warningPermissions') }}</li>
            <li>{{ t('warningApps') }}</li>
            <li>{{ t('warningPortals') }}</li>
            <li>{{ t('warningCatalogs') }}</li>
            <li>{{ t('warningApiKeys') }}</li>
            <li>{{ t('warningProcessings') }}</li>
          </ul>
          <p class="mt-2">
            {{ t('warningOutro') }}
          </p>
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="changeOwner.loading.value"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :disabled="!newOwner"
          :loading="changeOwner.loading.value"
          @click="changeOwner.execute()"
        >
          {{ t('confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  changeOwnerTitle: Changer le propriétaire
  warningIntro: "Le changement de propriétaire peut avoir de nombreux effets. Avant de confirmer l'opération, effectuez ces vérifications :"
  warningPermissions: quelles personnes ont les permissions nécessaires pour contribuer ou pour utiliser la ressource ?
  warningApps: quelles applications utilisent la ressource ?
  warningPortals: sur quels portails la ressource est-elle publiée ?
  warningCatalogs: sur quels catalogues la ressource est-elle publiée ?
  warningApiKeys: la ressource est-elle utilisée par des programmes qui utilisent une clé d'API du compte propriétaire ?
  warningProcessings: la ressource est-elle associée à un traitement automatisé ?
  warningOutro: Après la confirmation vérifiez de nouveau tous ces aspects et effectuez les corrections nécessaires.
  childrenWarning: aucune ressource enfant | Cette ressource a une ressource enfant, qui changera de propriétaire avec elle. | Cette ressource a {count} ressources enfants, qui changeront de propriétaire avec elle.
  cancel: Annuler
  confirm: Confirmer
  successMsg: Propriétaire modifié avec succès
  errorMsg: Échec du changement de propriétaire
en:
  changeOwnerTitle: Change owner
  warningIntro: "Changing the owner can have many effects. Before confirming, check the following:"
  warningPermissions: who has the necessary permissions to contribute or use the resource?
  warningApps: which applications use the resource?
  warningPortals: on which portals is the resource published?
  warningCatalogs: on which catalogs is the resource published?
  warningApiKeys: is the resource used by programs that use an API key from the owner account?
  warningProcessings: is the resource associated with an automated processing?
  warningOutro: After confirmation, review all these aspects again and make the necessary corrections.
  childrenWarning: no child resource | This resource has a child resource, which will change owner along with it. | This resource has {count} child resources, which will change owner along with them.
  cancel: Cancel
  confirm: Confirm
  successMsg: Owner successfully changed
  errorMsg: Failed to change owner
</i18n>

<script setup lang="ts">
import { type ResourceType } from '@data-fair/data-fair-shared/resources/parent-children.ts'
import { fetchChildRefs } from '~/utils/part-of'

const props = defineProps<{
  // the whole resource: the links to its children are resolved from its own content
  resource: Record<string, any> & { id: string, owner: Record<string, any> }
  resourceType: 'datasets' | 'applications'
}>()

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()

const showDialog = defineModel<boolean>({ default: false })
const newOwner = ref<Record<string, any> | null>({ ...props.resource.owner })

// the api exposes each resource type as the collection of its plural
const parentType = props.resourceType.slice(0, -1) as ResourceType

// partOf children follow their parent into the new account, warn about the ones that will move
const childrenCount = ref(0)
watch(showDialog, async (visible) => {
  if (!visible) return
  childrenCount.value = (await fetchChildRefs(parentType, props.resource)).length
})

const changeOwner = useAsyncAction(
  async () => {
    if (!newOwner.value) return
    await $fetch(`${props.resourceType}/${props.resource.id}/owner`, {
      method: 'PUT',
      body: newOwner.value
    })
    showDialog.value = false
    emit('changed')
  },
  {
    success: t('successMsg'),
    error: t('errorMsg')
  }
)
</script>
