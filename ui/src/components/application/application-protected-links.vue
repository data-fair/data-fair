<template>
  <v-container fluid>
    <p>{{ t('message') }}</p>

    <v-alert
      type="warning"
      variant="outlined"
      class="mb-4"
    >
      {{ t('warning') }}
    </v-alert>

    <template v-if="applicationKeys !== null">
      <template v-if="protectedLink">
        <p class="mb-0">
          {{ t('protectedLink') }}
          <a :href="protectedLink">{{ protectedLink }}</a>
          <v-btn
            v-if="can('setKeys')"
            :icon="mdiDelete"
            variant="text"
            size="small"
            color="warning"
            :title="t('delete')"
            :loading="loading"
            @click="deleteLink"
          />
        </p>
      </template>

      <v-btn
        v-else-if="can('setKeys')"
        color="primary"
        :disabled="loading"
        @click="addLink"
      >
        {{ t('createProtectedLink') }}
      </v-btn>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  message: Creez un lien que vous pourrez communiquer aux personnes avec qui vous souhaitez partager cette application et qui ne sont pas authentifies sur ce service.
  warning: Attention ! Ce lien donne acces a cette application et au contenu du jeu de donnees reference dans sa configuration. Si vous craignez que ce lien ait trop circule vous pouvez le supprimer, en creer un autre et communiquer ce nouveau lien aux bonnes personnes.
  protectedLink: "Lien protege :"
  delete: Supprimer ce lien
  createProtectedLink: Creer un lien protege
en:
  message: Create a link that you will be able to share with the people to whom you want to give access to this application and who are not authenticated on this service.
  warning: Warning! This link gives access to this application and to the content of the dataset used in its configuration. If you fear this link might have been too widely communicated you can delete it then create another one and communicate this new link to your users.
  protectedLink: "Protected link:"
  delete: Delete this link
  createProtectedLink: Create a protected link
</i18n>

<script lang="ts" setup>
import { mdiDelete } from '@mdi/js'
import useApplicationStore from '~/composables/application/store'
import { $siteUrl, $fetch } from '~/context'

interface ApplicationKey {
  id: string
  title: string
}

const { t } = useI18n()
const { application, can } = useApplicationStore()

const applicationKeys = ref<ApplicationKey[] | null>(null)
const loading = ref(false)

const protectedLink = computed(() => {
  if (!applicationKeys.value?.length || !application.value) return null
  return $siteUrl + '/data-fair/app/' + encodeURIComponent(applicationKeys.value[0].id + ':' + application.value.id)
})

onMounted(async () => {
  if (!application.value) return
  applicationKeys.value = await $fetch<ApplicationKey[]>(`/applications/${application.value.id}/keys`)
})

const addLink = async () => {
  if (!application.value) return
  loading.value = true
  try {
    applicationKeys.value = await $fetch<ApplicationKey[]>(`/applications/${application.value.id}/keys`, {
      method: 'POST',
      body: [...(applicationKeys.value ?? []), { title: t('protectedLink') }]
    })
  } finally {
    loading.value = false
  }
}

const deleteLink = async () => {
  if (!application.value) return
  loading.value = true
  try {
    applicationKeys.value = await $fetch<ApplicationKey[]>(`/applications/${application.value.id}/keys`, {
      method: 'POST',
      body: []
    })
  } finally {
    loading.value = false
  }
}
</script>
