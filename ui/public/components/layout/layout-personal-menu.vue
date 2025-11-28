<template>
  <v-toolbar-items
    v-if="initialized"
    class="personal-menu"
  >
    <v-btn
      v-if="!user"
      v-t="'login'"
      depressed
      color="primary"
      @click="login"
    />
    <v-menu
      v-else
      offset-y
      nudge-left
      max-height="700"
    >
      <template #activator="{on}">
        <v-btn
          text
          class="px-0"
          :title="$t('openPersonalMenu')"
          v-on="on"
        >
          <avatar show-account />
          <v-icon
            v-if="user.pd"
            color="warning"
            style="position:absolute;"
          >
            mdi-alert
          </v-icon>
        </v-btn>
      </template>

      <v-list
        outlined
        class="py-0"
      >
        <!-- current account, not actionable -->
        <v-list-item
          disabled
          :style="activeAccount.type !== 'user' ? 'padding-left:0' : ''"
        >
          <avatar
            show-account
            style="margin-right: 16px;"
          />

          <v-list-item-content class="text--secondary">
            <v-list-item-title>
              {{ activeAccount.type === 'user' ? $t('personalAccount') : activeAccount.name }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="activeAccount.department">
              {{ activeAccount.departmentName || activeAccount.department }}
            </v-list-item-subtitle>
            <v-list-item-subtitle>{{ user.name }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>

        <!-- cancel a planned deletion ? -->
        <template v-if="user.pd">
          <v-alert
            :value="true"
            type="warning"
            tile
            :outlined="$vuetify.theme.dark"
            style="max-width:440px;"
          >
            {{ $t('plannedDeletion', {name: user.name, plannedDeletion: $d(new Date(user.pd))}) }}
          </v-alert>

          <v-row class="justify-center ma-0 mb-2">
            <v-btn
              color="warning"
              text
              @click="cancelDeletion"
            >
              {{ $t('cancelDeletion') }}
            </v-btn>
          </v-row>
        </template>

        <!-- global account switching (personal account and organizations) -->
        <template v-if="siteInfo.main && user.organizations.length > 1 || (user.organizations.length === 1 && (!user.ipa || activeAccount.type === 'user'))">
          <v-subheader
            v-t="'switchAccount'"
            style="height: 24px"
          />
          <v-list-item
            v-if="activeAccount.type !== 'user' && !user.ipa"
            id="toolbar-menu-switch-user"
            @click="switchOrganization()"
          >
            <v-list-item-action class=" my-0">
              <v-avatar :size="28">
                <img :src="`${directoryUrl}/api/avatars/user/${user.id}/avatar.png`">
              </v-avatar>
            </v-list-item-action>
            <v-list-item-title v-t="'personalAccount'" />
          </v-list-item>
          <v-list-item
            v-for="organization in user.organizations.filter(o => activeAccount.type === 'user' || activeAccount.id !== o.id || (activeAccount.department || null) !== (o.department || null))"
            :id="'toolbar-menu-switch-orga-' + organization.id + '-' + organization.department"
            :key="organization.id + '-' + organization.department"
            @click="switchOrganization(organization.id + ':' + (organization.department || ''))"
          >
            <v-list-item-action class="my-0">
              <v-avatar :size="28">
                <img
                  v-if="organization.department"
                  :src="`${directoryUrl}/api/avatars/organization/${organization.id}/${organization.department}/avatar.png`"
                >
                <img
                  v-else
                  :src="`${directoryUrl}/api/avatars/organization/${organization.id}/avatar.png`"
                >
              </v-avatar>
            </v-list-item-action>
            <v-list-item-content>
              <v-list-item-title>
                {{ organization.name }}
              </v-list-item-title>
              <v-list-item-subtitle v-if="organization.department">
                {{ organization.departmentName || organization.department }}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </template>
        <!-- simply department switching when on an organization's site-->
        <template v-if="!siteInfo.main && user.organizations.filter(o => o.id === siteInfo.owner.id).length > 1">
          <v-subheader
            v-t="'switchAccount'"
            style="height: 24px"
          />
          <v-list-item
            v-for="organization in user.organizations.filter(o => o.id === siteInfo.owner.id && (activeAccount.department || null) !== (o.department || null))"
            :id="'toolbar-menu-switch-orga-' + organization.id + '-' + organization.department"
            :key="organization.id + '-' + organization.department"
            @click="switchOrganization(organization.id + ':' + (organization.department || ''))"
          >
            <v-list-item-action class="my-0">
              <v-avatar :size="28">
                <img :src="`${directoryUrl}/api/avatars/organization/${organization.id}/${organization.department}/avatar.png`">
              </v-avatar>
            </v-list-item-action>
            <v-list-item-content>
              <v-list-item-title>
                {{ organization.departmentName || organization.department }}
              </v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </template>

        <v-divider />

        <slot name="actions-before" />

        <!-- toggle admin mode -->
        <v-list-item
          v-if="user.isAdmin"
          dense
        >
          <v-list-item-action><v-icon>mdi-shield-alert</v-icon></v-list-item-action>
          <v-list-item-title style="overflow: visible;">
            <v-switch
              v-model="user.adminMode"
              color="admin"
              hide-details
              class="mt-0"
              :label="$t('adminMode')"
              @change="setAdminMode"
            />
          </v-list-item-title>
        </v-list-item>

        <!-- get back to normal admin session after impersonating a user -->
        <v-list-item
          v-if="user.asAdmin"
          color="admin"
          @click="asAdmin()"
        >
          <v-list-item-action><v-icon>mdi-account-switch-outline</v-icon></v-list-item-action>
          <v-list-item-title>{{ $t('backToAdmin') }}</v-list-item-title>
        </v-list-item>

        <!-- switch dark mode -->
        <v-list-item
          v-if="darkModeSwitch"
          dense
        >
          <v-list-item-action><v-icon>mdi-weather-night</v-icon></v-list-item-action>
          <v-list-item-title style="overflow: visible;">
            <v-switch
              :input-value="$vuetify.theme.dark"
              hide-details
              class="mt-0"
              :label="$t('darkMode')"
              color="white"
              @change="setDarkCookie"
            />
          </v-list-item-title>
        </v-list-item>

        <!-- logout button -->
        <v-divider />
        <v-list-item @click="logout">
          <v-list-item-action><v-icon>mdi-logout</v-icon></v-list-item-action>
          <v-list-item-title v-t="'logout'" />
        </v-list-item>
      </v-list>
    </v-menu>
  </v-toolbar-items>
</template>

<i18n lang="yaml">
fr:
  login: Se connecter / S'inscrire
  logout: Se déconnecter
  openPersonalMenu: Ouvrez le menu personnel
  personalAccount: Compte personnel
  switchAccount: Changer de compte
  adminMode: mode admin
  backToAdmin: Revenir à ma session administrateur
  darkMode: mode nuit
  plannedDeletion: La suppression de l'utilisateur {name} et toutes ses informations est programmée le {plannedDeletion}.
  cancelDeletion: Annuler la suppression de l'utilisateur
en:
  login: Login / Sign up
  logout: Logout
  openPersonalMenu: Open personal menu
  personalAccount: Personal account
  switchAccount: Switch account
  adminMode: admin mode
  backToAdmin: Return to administrator session
  darkMode: night mode
  plannedDeletion: The deletion of the user {name} and all its data is planned on the {plannedDeletion}.
  cancelDeletion: Cancel the deletion of the user
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import Avatar from '@data-fair/sd-vue/src/vuetify/avatar.vue'

export default {
  components: { Avatar },
  props: {
    redirectAdminMode: { type: String, required: false },
    darkModeSwitch: { type: Boolean, default: true },
  },
  computed: {
    ...mapState(['siteInfo']),
    ...mapState('session', ['user', 'initialized', 'directoryUrl']),
    ...mapGetters('session', ['activeAccount'])
  },
  methods: {
    ...mapActions('session', ['logout', 'login', 'switchOrganization', 'asAdmin', 'cancelDeletion']),
    setDarkCookie (value) {
      const maxAge = 60 * 60 * 24 * 100 // 100 days
      this.$cookies.set('theme_dark', '' + value, { maxAge, path: '/' })
      window.location.reload()
    },
    setAdminMode (value) {
      const redirect = value ? null : this.redirectAdminMode
      this.$store.dispatch('session/setAdminMode', { value, redirect })
    }
  }
}
</script>

<style>

</style>
