<template>
  <v-tooltip>
    <template #activator="{props}">
      <v-icon
        :color="visibility === 'public' ? 'primary' : 'warning'"
        :size="size"
        v-bind="props"
      >
        {{ visibility === 'public' ? mdiLockOpen : mdiLock }}
      </v-icon>
    </template>
    {{ t(visibility) }}
  </v-tooltip>
</template>

<i18n lang="yaml">
fr:
  public: Public
  private: Privé
  protected: Protégé
en:
  public: Public
  private: Private
  protected: Protected
</i18n>

<script setup lang="ts">
import { mdiLockOpen, mdiLock } from '@mdi/js'

defineProps({
  visibility: { type: String as () => 'public' | 'private' | 'protected', required: true },
  size: { type: String, default: undefined },
})
const { t } = useI18n()
</script>

<style lang="css" scoped>
</style>
