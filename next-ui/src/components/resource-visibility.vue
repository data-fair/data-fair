<template>
  <v-tooltip>
    <template #activator="{props}">
      <v-icon
        :color="visibility === 'public' ? 'primary' : 'accent'"
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

<script lang="ts" setup>
import { mdiLockOpen, mdiLock } from '@mdi/js'

defineProps({ visibility: { type: String as () => 'public' | 'private' | 'protected', required: true } })
const { t } = useI18n()
</script>

<style lang="css" scoped>
</style>
