<template>
  <div v-if="modelValue">
    <v-checkbox
      v-model="modelValue.public"
      :label="t('public')"
    />
    <v-autocomplete
      v-if="!modelValue.public && accountsFetch.data.value"
      v-model="modelValue.privateAccess"
      v-model:search="search"
      :items="accountsFetch.data.value.results"
      :loading="accountsFetch.loading.value"
      :multiple="true"
      :clearable="true"
      :item-title="(item) => item && `${item.name || item.id} (${item.type})`"
      :item-value="(item) => item && `${item.type}:${item.id}`"
      :label="t('privateAccess')"
      :placeholder="t('searchName')"
      return-object
      hide-no-data
    />
    {{ search }}
  </div>
</template>

<i18n lang="yaml">
fr:
  public: Public
  privateAccess: Vue restreinte à des comptes
  searchName: Saisissez un nom d'organisation
en:
  public: Public
  privateAccess: Restricted access to some accounts
  searchName: Search an organization name
</i18n>

<script lang="ts" setup>

const modelValue = defineModel<{ public?: boolean, privateAccess?: { type: string, id: string, name: string }[] }>()

const { t } = useI18n()

const search = ref('')
const query = () => ({ q: search.value })
const accountsFetch = useFetch<{ results: { type: string, id: string, name: string }[] }>($sitePath + '/simple-directory/api/accounts', { query })

</script>

<style>

</style>
