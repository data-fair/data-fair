<i18n lang="yaml">
fr:
  agents: Agents
en:
  agents: Agents
</i18n>

<template>
  <v-container>
    <h2 class="text-title-large mb-4">
      {{ t('agents') }}
    </h2>
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-autocomplete
          v-model="selectedOwner"
          :items="owners"
          item-title="name"
          :item-value="(o: any) => o"
          label="Organisation"
          :loading="ownersFetch.loading.value"
        />
      </v-col>
    </v-row>
    <d-frame
      v-if="selectedOwner"
      id="agents"
      :src="`${$sitePath}/agents/${selectedOwner.type}/${selectedOwner.id}/settings`"
      class="fill-height"
      sync-params
      :sync-path="$sitePath + '/data-fair/admin/agents/'"
      emit-iframe-messages
      resize="no"
      :adapter.prop="stateChangeAdapter"
      @message="onMessage"
      @iframe-message="onMessage"
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />
  </v-container>
</template>

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
