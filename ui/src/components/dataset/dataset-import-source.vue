<template>
  <div v-if="dataset">
    <!-- File dataset -->
    <div v-if="isFileDataset">
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
                {{ file.name }}
              </v-card-title>
              <v-card-subtitle v-if="file.size">
                {{ formatBytes(file.size) }}
              </v-card-subtitle>
            </v-card-item>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- REST dataset -->
    <div v-else-if="dataset.isRest" />

    <!-- Virtual dataset -->
    <div v-else-if="dataset.isVirtual">
      <dataset-virtual-children />
    </div>
  </div>
</template>

<script setup lang="ts">
import { mdiFileDownload } from '@mdi/js'

const { dataset, dataFiles } = useDatasetStore()

const isFileDataset = computed(() => {
  const d = dataset.value
  return d && !d.isRest && !d.isVirtual && !d.isMetaOnly && d.file
})

// Only show original and converted files, not the full-csv export
const sourceFiles = computed(() => {
  return dataFiles.value.filter(f => f.key === 'original' || f.key === 'converted')
})
</script>
