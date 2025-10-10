<template>
  <v-app-bar
    flat
    border
    density="compact"
    class="px-0 main-app-bar"
    style="border-left: none; border-right: none; border-top: none;"
  >
    <!--<v-list
      :style="$vuetify.display.mobile ? '' : 'width: 256px;'"
      class="py-0"
      color="transparent"
    >
      <layout-brand-title />
    </v-list>-->
    <v-divider
      v-if="!$vuetify.display.mobile"
      vertical
    />
    <!--
    <v-toolbar-items v-if="!navContext.drawer">
      <v-btn
        variant="text"
        color="primary"
        @click="navContext.drawer = true"
      >
        <v-icon>mdi-menu</v-icon>
      </v-btn>
    </v-toolbar-items>
    -->
    <v-breadcrumbs
      v-if="breadcrumbs && breadcrumbsRouteName === route.name && $vuetify.display.mdAndUp"
      :items="breadcrumbs"
    />
    <v-spacer />
    <!--
    <v-toolbar-items>
      <notifications-queue
        v-if="user && env.notifyUrl"
        :notify-url="env.notifyUrl"
      />
    </v-toolbar-items>
    -->
    <personal-menu />
    <!--
    <personal-menu>
      <template #actions-before="{}">
        <v-list-item
          :to="'/me'"
          :nuxt="true"
        >
          <template #prepend>
            <v-icon>mdi-information-outline</v-icon>
          </template>
          <v-list-item-title v-t="'myAccount'" />
        </v-list-item>

        <template v-if="!missingSubscription">
          <v-list-item
            v-if="env.notifyUrl"
            :nuxt="true"
            :to="`/notifications`"
          >
            <template #prepend>
              <v-icon>mdi-bell-plus</v-icon>
            </template>
            <v-list-item-title v-t="'notifications'" />
          </v-list-item>
        </template>
        <v-divider />
      </template>
    </personal-menu>
    -->
    <lang-switcher />
  </v-app-bar>
</template>

<i18n lang="yaml">
fr:
  login: Se connecter / S'inscrire
  logout: Se déconnecter
  personalAccount: Compte personnel
  switchAccount: Changer de compte
  notifications: Notifications
  myAccount: Informations personnelles
en:
  login: Login / Sign up
  logout: Logout
  personalAccount: Personal account
  switchAccount: Switch account
  notifications: Notifications
  myAccount: Personal info
</i18n>

<script setup>
import PersonalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import LangSwitcher from '@data-fair/lib-vuetify/lang-switcher.vue'

const { breadcrumbs, breadcrumbsRouteName } = useNavigationStore()
const route = useRoute()
// const missingSubscription = computed(() => store.getters.missingSubscription)
</script>

<style lang="css">
</style>
