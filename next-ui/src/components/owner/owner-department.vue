<template>
  <v-tooltip
    v-if="owner && owner.department"
    location="top"
  >
    <template #activator="{props}">
      <span
        class="text-body-2 ml-1"
        v-bind="props"
      >
        <v-avatar :size="28">
          <img :src="`${$sdUrl}/api/avatars/${owner.type}/${owner.id}/${owner.department}/avatar.png`">
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

const { owner } = defineProps({ owner: { type: Object as () => Account, required: true } })

const label = computed(() => owner.departmentName || owner.department)
</script>

<style lang="css" scoped>
</style>
