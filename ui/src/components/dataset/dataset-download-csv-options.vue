<template>
  <v-list-item>
    <v-select
      v-model="csvSep"
      :items="[',', ';']"
      density="compact"
      hide-details
      :label="t('separator')"
      template
      style="width: 120px"
      class="mt-1"
      variant="plain"
    />
    <template #append>
      <v-btn
        :href="href"
        variant="text"
        color="primary"
        @click="$emit('click')"
      >
        {{ t('validate') }}
      </v-btn>
    </template>
  </v-list-item>
</template>

<i18n lang="yaml">
fr:
  separator: Séparateur
  validate: Valider
en:
  separator: Separator
  validate: Validate
</i18n>

<script setup lang="ts">
defineProps({ href: { type: String, default: null } })
defineEmits(['click'])
const csvSep = defineModel('csvSep', { type: String, required: true })

const { t } = useI18n()

</script>
