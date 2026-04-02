<template>
  <div v-if="dataset">
    <!-- File dataset -->
    <template v-if="isFileDataset">
      <v-btn
        v-if="can('writeData').value"
        color="primary"
        variant="flat"
        class="mb-4"
        :prepend-icon="mdiFileUpload"
        :to="`/dataset/${dataset.id}/edit-data`"
      >
        {{ t('updateData') }}
      </v-btn>
      <v-row>
        <v-col
          v-for="file in sourceFiles"
          :key="file.key"
          cols="12"
          sm="6"
          md="4"
        >
          <v-card
            :href="file.url"
            variant="outlined"
            class="h-100"
          >
            <v-card-item>
              <template #prepend>
                <v-icon
                  :icon="mdiFileDownload"
                  color="primary"
                  size="32"
                />
              </template>
              <v-card-title class="text-body-large font-weight-bold">
                {{ file.title }}
              </v-card-title>
              <v-card-subtitle v-if="file.size">
                {{ formatBytes(file.size) }}
              </v-card-subtitle>
            </v-card-item>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <!-- REST dataset -->
    <template v-else-if="dataset.isRest">
      <v-btn
        v-if="can('createLine').value"
        color="primary"
        variant="flat"
        class="mb-4"
        :prepend-icon="mdiFileUpload"
        :to="`/dataset/${dataset.id}/edit-data`"
      >
        {{ t('updateData') }}
      </v-btn>
    </template>

    <!-- Virtual dataset -->
    <template v-else-if="dataset.isVirtual">
      <dataset-virtual-children />
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  updateData: Mettre à jour les données
en:
  updateData: Update data
</i18n>

<script setup lang="ts">
import { mdiFileDownload, mdiFileUpload } from '@mdi/js'

const { t } = useI18n()
const { dataset, dataFiles, can } = useDatasetStore()

const isFileDataset = computed(() => {
  const d = dataset.value
  return d && !d.isRest && !d.isVirtual && !d.isMetaOnly && d.file
})

// Only show original and converted files, not the full-csv export
const sourceFiles = computed(() => {
  return dataFiles.value.filter(f => f.key === 'original' || f.key === 'converted').map(f => {
    const d = dataset.value!
    const size = f.key === 'original' ? d.originalFile?.size : d.file?.size
    return { ...f, size }
  })
})
</script>
