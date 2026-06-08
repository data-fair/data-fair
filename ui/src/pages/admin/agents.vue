<template>
  <div class="d-flex flex-column fill-height">
    <div class="d-flex align-center ga-4 pa-4 flex-shrink-0">
      <h2 class="text-title-large">
        {{ t('agents') }}
      </h2>
      <v-autocomplete
        v-model="selectedOwner"
        v-model:search="search"
        :items="owners"
        item-title="name"
        :item-value="(o: any) => o"
        :label="t('org')"
        :loading="ownersFetch.loading.value"
        :no-filter="true"
        :return-object="true"
        :placeholder="t('searchName')"
        density="compact"
        hide-details
        hide-no-data
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
      @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  agents: Agents
  org: Organisation
  searchName: Saisissez un nom d'organisation
en:
  agents: Agents
  org: Organization
  searchName: Search an organization name
</i18n>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDFramePage } from '~/composables/layout/use-d-frame-page'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { stateChangeAdapter, onMessage } = useDFramePage()

const selectedOwner = ref<{ type: string, id: string, name: string } | null>(null)

const search = ref('')
const query = () => ({ type: 'organization', q: search.value, size: 20 })
const ownersFetch = useFetch<{ results: { type: string, id: string, name: string }[] }>($sitePath + '/simple-directory/api/accounts', { query })

const owners = computed(() => {
  const results = ownersFetch.data.value?.results ?? []
  if (selectedOwner.value && !results.find(o => o.id === selectedOwner.value!.id && o.type === selectedOwner.value!.type)) {
    return [selectedOwner.value, ...results]
  }
  return results
})
</script>
