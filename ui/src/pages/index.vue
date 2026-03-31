<template>
  <v-container class="home">
    <!-- Missing subscription: show alert -->
    <v-alert
      v-if="user && missingSubscription"
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

    <!-- Not logged in -->
    <template v-if="!user">
      <v-row justify="center">
        <v-col
          cols="12"
          sm="8"
          md="6"
          class="text-center"
        >
          <h1 class="text-headline-large text-primary mb-3 mt-5">
            Data Fair
          </h1>
          <df-themed-svg
            :source="dataProcessSvg"
            style="max-width: 400px; max-height: 250px; width: 100%; margin: 0 auto;"
          />
          <p
            v-if="!$uiConfig.disableApplications"
            class="text-title-medium"
          >
            {{ t('description') }}
          </p>
          <p class="text-title-medium mt-5">
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
      <v-row>
        <v-col cols="12">
          <h2 class="mb-4 text-headline-small">
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

      <!-- Contribute section -->
      <template v-if="canContribDep">
        <v-row class="mx-0 mt-4 mb-1">
          <h2 class="text-title-large">
            {{ t('contribute') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/new-dataset?simple=true"
              :title="t('createDataset')"
              :svg="dataSvg"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/update-dataset"
              :title="t('updateDataset')"
              :svg="dataMaintenanceSvg"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-svg-link
              to="/share-dataset"
              :title="t('shareDataset')"
              :svg="shareSvg"
            />
          </v-col>
        </v-row>
      </template>

      <!-- Manage datasets section -->
      <template v-if="canAdminDep">
        <v-row class="mx-0 mt-6 mb-1">
          <h2 class="text-title-large">
            {{ t('manageDatasets') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-requested-publications />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-error />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-datasets-draft />
          </v-col>
        </v-row>

        <!-- Manage applications section -->
        <v-row class="mx-0 mt-6 mb-1">
          <h2 class="text-title-large">
            {{ t('manageApplications') }}
          </h2>
        </v-row>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <dashboard-applications-requested-publications />
          </v-col>
        </v-row>
      </template>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
import { mdiAlert } from '@mdi/js'
import { usePermissions } from '~/composables/use-permissions'
import dataSvg from '~/assets/svg/Data Arranging_Two Color.svg?raw'
import dataMaintenanceSvg from '~/assets/svg/Data maintenance_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import dataProcessSvg from '~/assets/svg/Data Process_Two Color.svg?raw'

const { t } = useI18n()
const session = useSession()
const user = session.user
const account = session.account

// usePermissions uses useSession() internally, so it can be called unconditionally
const { canContribDep, canAdminDep, missingSubscription } = usePermissions()

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
  description: Enrichissez et publiez facilement vos données. Vous pouvez les utiliser dans des applications dédiées et les mettre à disposition d'autres personnes en mode ouvert ou privé.
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
  contribute: Contribuez
  createDataset: Créer un nouveau jeu de données
  updateDataset: Mettre à jour un jeu de données
  shareDataset: Publier un jeu de données
  manageDatasets: Gérez les jeux de données
  manageApplications: Gérez les applications
en:
  authRequired: You must be logged in to use this service.
  login: Login / Sign up
  description: Easily enrich and publish your data. You can use it in dedicated applications and make it available to other people both openly or privately.
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
  contribute: Contribute
  createDataset: Create a dataset
  updateDataset: Update a dataset
  shareDataset: Share a dataset
  manageDatasets: Manage datasets
  manageApplications: Manage applications
</i18n>
