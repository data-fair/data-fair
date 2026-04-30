<template>
  <div class="d-flex flex-column fill-height">
    <div class="d-flex align-center ga-4 pa-4 flex-shrink-0">
      <h2 class="text-title-large">
        {{ t('agents') }}
      </h2>
      <v-autocomplete
        v-model="selectedOwner"
        :items="owners"
        item-title="name"
        :item-value="(o: any) => o"
        :label="t('org')"
        :loading="ownersFetch.loading.value"
        density="compact"
        hide-details
        max-width="300"
        variant="outlined"
      />
    </div>
    <d-frame
      v-if="selectedOwner"
      id="agents"
      :adapter.prop="stateChangeAdapter"
      :src="`/agents/${selectedOwner.type}/${selectedOwner.id}/settings`"
      sync-path="/data-fair/admin/agents/"
      class="flex-grow-1"
      resize="no"
      sync-params
      emit-iframe-messages
      @message="onMessage"
      @iframe-message="onMessage"
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  agents: Agents
  org: Organisation
en:
  agents: Agents
  org: Organization
</i18n>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const selectedOwner = ref<{ type: string, id: string, name: string } | null>(null)

const ownersFetch = useFetch<{ results: { type: string, id: string, name: string }[] }>($sitePath + '/simple-directory/api/accounts', {
  query: computed(() => ({ type: 'organization', size: 1000 })), watch: false
})
ownersFetch.refresh()

const owners = computed(() => {
  return ownersFetch.data.value?.results ?? []
})
</script>
