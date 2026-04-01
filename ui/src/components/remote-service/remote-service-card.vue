<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    :to="`/remote-services/${encodeURIComponent(remoteService.id ?? '')}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span class="font-weight-bold">{{ remoteService.title || remoteService.id }}</span>
      </template>
    </v-card-item>
    <v-divider />
    <v-card-text class="pa-0 flex-grow-1">
      <v-list
        density="compact"
        style="background-color: inherit;"
      >
        <v-list-item v-if="remoteService.public">
          <template #prepend>
            <v-icon
              :icon="mdiLockOpen"
              color="primary"
            />
          </template>
          {{ t('public') }}
        </v-list-item>
        <v-list-item v-else>
          <template #prepend>
            <v-icon
              :icon="mdiLock"
              color="warning"
            />
          </template>
          {{ t('private') }}
        </v-list-item>
        <v-list-item v-if="!remoteService.public && remoteService.privateAccess?.length">
          <div class="d-flex flex-wrap ga-1">
            <owner-short
              v-for="owner in remoteService.privateAccess"
              :key="owner.id"
              :owner="owner"
            />
          </div>
        </v-list-item>
        <v-list-item v-if="remoteService.description">
          <div
            class="card-description"
            v-html="remoteService.description"
          />
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { RemoteService } from '#api/types'
import { mdiLockOpen, mdiLock } from '@mdi/js'

defineProps<{ remoteService: RemoteService }>()

const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  public: Public
  private: Privé
en:
  public: Public
  private: Private
</i18n>

<style lang="css" scoped>
.card-description {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
