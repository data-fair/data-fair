<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    :to="`/remote-service/${encodeURIComponent(remoteService.id ?? '')}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span
          class="font-weight-bold"
          :title="remoteService.title || remoteService.id"
        >{{ remoteService.title || remoteService.id }}</span>
      </template>
      <template
        v-if="!remoteService.public && remoteService.privateAccess?.length"
        #append
      >
        <div class="d-flex flex-wrap ga-1">
          <owner-short
            v-for="owner in remoteService.privateAccess"
            :key="owner.id"
            :owner="owner"
          />
        </div>
      </template>
    </v-card-item>
    <v-divider />
    <v-card-text class="pa-0 flex-grow-1">
      <v-list
        v-if="remoteService.description"
        density="compact"
        style="background-color: inherit;"
      >
        <v-list-item>
          <div
            class="card-description"
            v-html="remoteService.description"
          />
        </v-list-item>
      </v-list>
    </v-card-text>

    <!--
      min-height: auto => remove default v-card-actions min-height
    -->
    <v-card-actions
      class="flex-column align-start text-body-small py-2"
      style="min-height: auto"
    >
      <div class="d-flex align-center flex-wrap">
        <resource-visibility
          :visibility="remoteService.public ? 'public' : 'private'"
          size="small"
        />
      </div>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { RemoteService } from '#api/types'

defineProps<{ remoteService: RemoteService }>()
</script>

<style lang="css" scoped>
.card-description {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
