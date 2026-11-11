<!-- eslint-disable vue/no-v-html -->
<template>
  <card-shell
    :title="remoteService.title || remoteService.id || ''"
    :to="`/remote-service/${encodeURIComponent(remoteService.id ?? '')}`"
  >
    <!-- Remote service description -->
    <div
      v-if="remoteService.description"
      class="df-card-desc px-1 text-body-medium"
      v-html="remoteService.description"
    />

    <template #footer>
      <!-- Access, with the accounts it is shared with -->
      <card-visibility
        :visibility="remoteService.public ? 'public' : 'protected'"
        :help="remoteService.public ? t('publicHelp') : t('privateHelp')"
      >
        <div
          v-for="owner in remoteService.privateAccess"
          :key="owner.type + owner.id"
          class="d-flex align-center ga-2 mt-1"
        >
          <owner-avatar
            :owner="owner"
            :size="18"
            :show-tooltip="false"
          />
          {{ owner.name || owner.id }}
        </div>
      </card-visibility>
    </template>
  </card-shell>
</template>

<script setup lang="ts">
import { RemoteService } from '#api/types'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

defineProps<{ remoteService: RemoteService }>()
const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  publicHelp: Utilisable par tous les comptes de la plateforme.
  privateHelp: "Utilisable seulement par :"
en:
  publicHelp: Usable by every account of the platform.
  privateHelp: "Usable only by:"
</i18n>
