<template>
  <attachments-list
    type="dataset"
    :attachments="attachments"
    :upload-url="uploadUrl"
    :can-add="canAdd"
    :can-edit="canEdit"
    :can-delete="canDelete"
    :can-thumbnail="canThumbnail"
    @patch="handlePatch"
  />
</template>

<script setup lang="ts">
import useDatasetStore from '~/composables/dataset/store'

const { dataset, patchDataset, resourceUrl, can } = useDatasetStore()

const attachments = computed(() => dataset.value?.attachments ?? [])
const uploadUrl = computed(() => `${resourceUrl.value}/metadata-attachments`)
const canAdd = computed(() => can('postMetadataAttachment').value)
const canEdit = computed(() => can('writeData').value)
const canDelete = computed(() => can('deleteMetadataAttachment').value)
const canThumbnail = computed(() => can('writeDescription').value)

const handlePatch = async (data: Record<string, unknown>) => {
  await patchDataset.execute(data)
}
</script>
