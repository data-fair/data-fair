<template>
  <v-dialog
    max-width="800"
    @update:model-value="val => val && resetCapture()"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <template #default="{ isActive }">
      <v-card :title="t('capture')">
        <v-card-text class="pb-0 pt-2">
          <p>{{ t('captureMsg') }}</p>
          <v-row density="comfortable">
            <v-col>
              <v-text-field
                v-model.number="width"
                :label="t('width')"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col>
              <v-text-field
                v-model.number="height"
                :label="t('height')"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
          <template v-if="syncState">
            <p class="mt-2">
              {{ t('setState') }}
            </p>
            <v-card
              variant="outlined"
              class="pa-0"
            >
              <d-frame
                :src="applicationLink"
                state-change-events
                resize="no"
                height="400px"
                @state-change="onStateChange"
              />
            </v-card>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="isActive.value = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="downloading"
            :prepend-icon="mdiCamera"
            @click="download"
          >
            {{ t('downloadCapture') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  capture: Capture
  captureMsg: Une image statique au format PNG va être créée à partir de cette application.
  downloadCapture: Télécharger la capture
  setState: Naviguez pour choisir l'état de l'application dans la capture.
  width: Largeur
  height: Hauteur
  cancel: Annuler
en:
  capture: Screenshot
  captureMsg: A static image with PNG format will be created based on this application.
  downloadCapture: Download the screenshot
  setState: Navigate to choose the state of the application in the screenshot.
  width: Width
  height: Height
  cancel: Cancel
</i18n>

<script setup lang="ts">
import { mdiCamera } from '@mdi/js'
import '@data-fair/frame/lib/d-frame.js'
import useApplicationStore from '~/composables/application/application-store'

const { t } = useI18n()
const { application, applicationLink, baseAppFetch } = useApplicationStore()

const width = ref(800)
const height = ref(450)
const stateSrc = ref<string | null>(null)
const downloading = ref(false)

const syncState = computed(() => {
  const meta = baseAppFetch.data.value?.meta as Record<string, string> | undefined
  return meta?.['df:sync-state'] && meta['df:sync-state'] !== 'false'
})

const resetCapture = () => {
  const meta = baseAppFetch.data.value?.meta as Record<string, string> | undefined
  width.value = Number(meta?.['df:capture-width'] || 800)
  height.value = Number(meta?.['df:capture-height'] || 450)
  stateSrc.value = null
}

const onStateChange = (e: CustomEvent) => {
  // detail is [action, href]
  if (e.detail?.[1]) {
    stateSrc.value = e.detail[1]
  }
}

const captureHref = computed(() => {
  if (!application.value) return ''
  const url = new URL(application.value.href + '/capture')
  url.searchParams.set('width', String(width.value))
  url.searchParams.set('height', String(height.value))
  if (application.value.fullUpdatedAt) {
    url.searchParams.set('updatedAt', application.value.fullUpdatedAt)
  }
  if (stateSrc.value) {
    try {
      const stateUrl = new URL(stateSrc.value)
      for (const key of stateUrl.searchParams.keys()) {
        url.searchParams.set('app_' + key, stateUrl.searchParams.get(key)!)
      }
    } catch {
      // ignore invalid URL
    }
  }
  return url.href
})

const download = async () => {
  if (!application.value) return
  downloading.value = true
  try {
    const res = await fetch(captureHref.value)
    const blob = await res.blob()
    const contentType = res.headers.get('content-type') || 'image/png'
    const ext = contentType.split('/').pop() || 'png'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = application.value.id + '.' + ext
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } finally {
    downloading.value = false
  }
}
</script>
