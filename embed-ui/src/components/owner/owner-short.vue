<template>
  <v-tooltip location="top">
    <template #activator="{props}">
      <span
        class="text-body-2"
        v-bind="props"
      >
        <v-avatar :size="28">
          <img
            v-if="owner.department && !ignoreDepartment"
            :src="`${$sdUrl}/api/avatars/${owner.type}/${owner.id}/${owner.department}/avatar.png`"
          >
          <img
            v-else
            :src="`${$sdUrl}/api/avatars/${owner.type}/${owner.id}/avatar.png`"
          >
        </v-avatar>
      </span>
    </template>
    {{ label }}
  </v-tooltip>
  <!--<span v-if="dataset.owner.type === 'user'"><v-icon>mdi-account</v-icon>&nbsp;{{ dataset.owner.name }}</span>
  <span v-if="dataset.owner.type === 'organization'"><v-icon>mdi-account-group</v-icon>&nbsp;{{ dataset.owner.name }}<span v-if="dataset.owner.role"> ({{ dataset.owner.role }})</span></span>-->
</template>

<script lang="ts" setup>
import { type Account } from '@data-fair/lib-vue/session'

const { owner, ignoreDepartment } = defineProps({
  owner: { type: Object as () => Account, required: true },
  ignoreDepartment: { type: Boolean, default: false }
})

const label = computed(() => {
  let label = owner.name
  if (owner.department && !ignoreDepartment) label += ' - ' + (owner.departmentName || owner.department)
  return label
})
</script>

<style lang="css" scoped>
</style>
