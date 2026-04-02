<template>
  <attachments-list
    type="application"
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
import useApplicationStore from '~/composables/application/store'

const { application, can, patch } = useApplicationStore()

const attachments = computed(() => application.value?.attachments ?? [])
const uploadUrl = computed(() => `${$apiPath}/applications/${application.value?.id}/attachments`)
const canAdd = computed(() => can('postAttachment'))
const canEdit = computed(() => can('postAttachment'))
const canDelete = computed(() => can('deleteAttachment'))
const canThumbnail = computed(() => can('writeDescription'))

const handlePatch = async (data: Record<string, unknown>) => {
  await patch(data as any)
}
</script>
