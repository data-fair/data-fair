<template>
  <d-frame
    v-if="inline"
    :src="iframeUrl"
  />
  <v-dialog
    v-else
    v-model="showDialog"
    max-width="500"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('title') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="showDialog = false"
        />
      </v-toolbar>
      <v-card-text class="py-0 px-3">
        <iframe
          v-if="showDialog"
          :src="iframeUrl"
          style="width: 100%; height: 300px; border: none; background-color: transparent;"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Notifications
en:
  title: Notifications
</i18n>

<script setup lang="ts">
import { mdiClose } from '@mdi/js'
import settingsSchema from '../../../../api/types/settings/schema.js'

const props = defineProps<{
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'dataset' | 'application'
  inline?: boolean
}>()

const { t } = useI18n()

const showDialog = ref(false)

const eventsUrl = window.location.origin + '/events'

const webhooksSchema = settingsSchema.properties.webhooks

const iframeUrl = computed(() => {
  const webhooks = webhooksSchema.items.properties.events.items.oneOf
    .filter((item: any) => {
      if (!item.const.startsWith(props.resourceType)) return false
      if (item.const === 'dataset-dataset-created') return false
      if (item.const === 'dataset-finalize-end') return false
      if (item.const === 'application-application-created') return false
      return true
    })
  const keysParam = webhooks.map((w: any) => `data-fair:${w.const}:${props.resource.slug}`).join(',')
  const titlesParam = webhooks.map((w: any) => w.title.replace(/,/g, ' ')).join(',')
  const urlTemplate = `${$siteUrl}/data-fair/${props.resourceType}/${props.resource.id}`
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department
  const searchParams = new URLSearchParams({
    key: keysParam,
    title: titlesParam,
    'url-template': urlTemplate,
    sender,
    register: 'false'
  }).toString()
  return `${eventsUrl}/embed/subscribe?${searchParams}`
})
</script>
