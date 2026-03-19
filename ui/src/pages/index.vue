<template>
  <v-container class="home">
    <!-- Not logged in -->
    <template v-if="!user">
      <v-row justify="center">
        <v-col
          cols="12"
          sm="8"
          md="6"
          class="text-center"
        >
          <h1 class="text-h4 mb-3 mt-5">
            Data Fair
          </h1>
          <p class="text-h6 mt-5">
            {{ t('authRequired') }}
          </p>
          <v-btn
            color="primary"
            @click="session.login()"
          >
            {{ t('login') }}
          </v-btn>
        </v-col>
      </v-row>
    </template>

    <!-- Logged in -->
    <template v-else>
      <!-- Subscription warning -->
      <v-alert
        v-if="$uiConfig.subscriptionUrl"
        type="warning"
        variant="tonal"
        class="mb-4"
      >
        <i18n-t keypath="subscriptionRequired">
          <template #subscriptionLink>
            <router-link to="/subscription">
              {{ t('subscriptionPage') }}
            </router-link>
          </template>
        </i18n-t>
      </v-alert>

      <v-row>
        <v-col cols="12">
          <h2 class="mb-4 text-h4">
            <template v-if="account && account.type === 'organization' && account.department">
              {{ t('departmentSpace', { name: account.name, departmentName: account.departmentName || account.department }) }}
            </template>
            <template v-else-if="account && account.type === 'organization'">
              {{ t('organizationSpace', { name: account.name }) }}
            </template>
            <template v-else-if="account">
              {{ t('userSpace', { name: account.name }) }}
            </template>
          </h2>

          <p
            v-if="account && account.type === 'organization'"
            class="mb-2"
          >
            <span v-safe-html="t('organizationRole', { role: accountOrgRole })" />
          </p>
          <p
            v-else-if="user.organizations.length"
            class="mb-2"
          >
            <v-icon color="warning">
              {{ mdiAlert }}
            </v-icon>
            <i18n-t keypath="collaborativeMessage">
              <template #collaborativeMode>
                <strong>{{ t('collaborativeMode') }}</strong>
              </template>
              <template #yourAccountLink>
                <router-link to="/me">
                  {{ t('yourAccount') }}
                </router-link>
              </template>
            </i18n-t>
          </p>
          <p
            v-else
            class="mb-2"
          >
            <i18n-t keypath="collaborativeMessageNoOrg">
              <template #collaborativeMode>
                <strong>{{ t('collaborativeMode') }}</strong>
              </template>
              <template #yourAccountLink>
                <router-link to="/me">
                  {{ t('yourAccount') }}
                </router-link>
              </template>
            </i18n-t>
          </p>
        </v-col>
      </v-row>

      <!-- Quick links -->
      <v-row class="mx-0 mt-4">
        <h2 class="text-h5">
          {{ t('quickLinks') }}
        </h2>
      </v-row>
      <v-row>
        <v-col
          cols="12"
          sm="4"
        >
          <v-card
            to="/datasets"
            variant="tonal"
            color="primary"
          >
            <v-card-title>
              <v-icon
                :icon="mdiDatabase"
                class="mr-2"
              />
              {{ t('datasets') }}
            </v-card-title>
          </v-card>
        </v-col>
        <v-col
          v-if="!$uiConfig.disableApplications"
          cols="12"
          sm="4"
        >
          <v-card
            to="/applications"
            variant="tonal"
            color="primary"
          >
            <v-card-title>
              <v-icon
                :icon="mdiImageMultiple"
                class="mr-2"
              />
              {{ t('applications') }}
            </v-card-title>
          </v-card>
        </v-col>
        <v-col
          cols="12"
          sm="4"
        >
          <v-card
            to="/storage"
            variant="tonal"
            color="primary"
          >
            <v-card-title>
              <v-icon
                :icon="mdiHarddisk"
                class="mr-2"
              />
              {{ t('storage') }}
            </v-card-title>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
import { mdiDatabase, mdiImageMultiple, mdiHarddisk, mdiAlert } from '@mdi/js'

const { t } = useI18n()
const session = useSession()
const user = session.user
const account = session.account

const accountOrgRole = computed(() => {
  if (!user.value || account.value?.type !== 'organization') return ''
  const org = user.value.organizations.find((o: any) => o.id === account.value?.id)
  return org?.role ?? ''
})
</script>

<i18n lang="yaml">
fr:
  authRequired: Vous devez être authentifié pour utiliser ce service.
  login: Se connecter / S'inscrire
  subscriptionRequired: Votre abonnement est requis. Rendez-vous sur la {subscriptionLink}.
  subscriptionPage: page d'abonnement
  organizationSpace: Espace de l'organisation {name}
  departmentSpace: Espace de l'organisation {name} / {departmentName}
  userSpace: Espace de l'utilisateur {name}
  organizationRole: Vous êtes <strong>{role}</strong> dans cette organisation.
  collaborativeMessage: Pour travailler en {collaborativeMode} vous devez ouvrir le menu personnel (en haut à droite) et changer de compte actif. Pour créer une nouvelle organisation rendez vous sur {yourAccountLink}.
  collaborativeMessageNoOrg: Pour travailler en {collaborativeMode} vous devez créer une organisation. Pour cela rendez vous sur {yourAccountLink}.
  collaborativeMode: mode collaboratif
  yourAccount: votre compte
  quickLinks: Accès rapide
  datasets: Jeux de données
  applications: Applications
  storage: Stockage
en:
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
  subscriptionRequired: Your subscription is required. Please visit the {subscriptionLink}.
  subscriptionPage: subscription page
  organizationSpace: Space of organization {name}
  departmentSpace: Space of organization {name} / {departmentName}
  userSpace: Space of user {name}
  organizationRole: You are <strong>{role}</strong> in this organization.
  collaborativeMessage: To work in {collaborativeMode} you must open the personal menu (top right) and change the active account. To create a new organization please visit {yourAccountLink}.
  collaborativeMessageNoOrg: To work in {collaborativeMode} you must create an organization. To do so please visit {yourAccountLink}.
  collaborativeMode: collaborative mode
  yourAccount: your account
  quickLinks: Quick links
  datasets: Datasets
  applications: Applications
  storage: Storage
</i18n>
