<template>
  <layout-navigation-top
    v-model:drawer="drawer"
    :breadcrumbs="breadcrumbs"
  />
  <layout-navigation-left
    v-if="user"
    v-model="drawer"
  />
  <v-main>
    <slot />
  </v-main>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import LayoutNavigationTop from '~/components/layout/layout-navigation-top.vue'
import LayoutNavigationLeft from '~/components/layout/layout-navigation-left.vue'
import { provideBreadcrumbs } from '~/composables/use-breadcrumbs'

const { lgAndUp } = useDisplay()
const drawer = ref(lgAndUp.value)
const { user } = useSession()
const breadcrumbs = provideBreadcrumbs()
</script>
