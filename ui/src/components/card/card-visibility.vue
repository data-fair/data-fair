<template>
  <!-- one icon per access level instead of the same lock for private and protected; the word is in the hover card -->
  <card-hover-info
    :title="t(visibility)"
    :icon="level.icon"
    :icon-color="level.color"
  >
    <v-icon
      :icon="level.icon"
      :color="level.color"
      size="18"
    />
    <span class="d-sr-only">{{ t(visibility) }}</span>
    <template #help>
      <div>{{ help ?? t(`help.${visibility}`) }}</div>
      <slot />
    </template>
  </card-hover-info>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiAccountMultiple, mdiEarth, mdiLock } from '@mdi/js'
import cardHoverInfo from './card-hover-info.vue'

const props = defineProps<{ visibility: 'public' | 'protected' | 'private', help?: string }>()
const { t } = useI18n()

const levels = {
  public: { icon: mdiEarth, color: 'primary' },
  // a list permission given to some accounts, not to anonymous visitors
  protected: { icon: mdiAccountMultiple, color: 'accent' },
  private: { icon: mdiLock, color: 'warning' }
}
const level = computed(() => levels[props.visibility])
</script>

<i18n lang="yaml">
fr:
  public: Public
  protected: Partagé
  private: Privé
  help:
    public: Visible par tout le monde, même sans compte.
    protected: Visible par les membres de l'organisation et par certains comptes.
    private: Visible seulement par les membres de l'organisation.
en:
  public: Public
  protected: Shared
  private: Private
  help:
    public: Visible by everyone, even without an account.
    protected: Visible by the members of the organization and by some accounts.
    private: Visible only by the members of the organization.
</i18n>
