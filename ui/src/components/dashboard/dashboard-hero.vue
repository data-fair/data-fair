<template>
  <div class="d-flex flex-column ga-4">
    <v-card style="border-left: 3px solid rgb(var(--v-theme-primary))">
      <v-card-text class="pa-6">
        <df-themed-svg
          :source="heroSvg"
          class="d-none d-md-block float-right ml-6"
          style="width: 190px"
        />
        <div
          class="text-label-medium text-uppercase mb-1"
          style="letter-spacing: .08em; opacity: .85"
        >
          {{ organization ? t('organizationSpace') : t('userSpace') }}
        </div>
        <h1
          class="text-headline-medium font-weight-bold"
          :class="{ 'mb-1': organization }"
        >
          {{ t('hello', { name: user.name }) }}
        </h1>
        <div
          v-if="organization"
          class="d-flex align-center flex-wrap ga-2"
        >
          {{ organization.department ? `${organization.name} / ${organization.departmentName || organization.department}` : organization.name }}
          <v-chip
            size="x-small"
            variant="flat"
            color="primary"
            class="font-weight-bold"
          >
            {{ organization.roleLabel || (['admin', 'contrib', 'user'].includes(organization.role) ? t('roles.' + organization.role) : organization.role) }}
          </v-chip>
        </div>
        <div
          v-if="canContribDep"
          class="d-flex flex-wrap align-center ga-2 mt-5"
        >
          <!-- the creation buttons of the datasets and applications lists -->
          <v-btn
            to="/new-dataset"
            :prepend-icon="mdiPlusCircle"
            color="accent"
            variant="flat"
            height="40"
          >
            {{ t('createDataset') }}
          </v-btn>
          <v-btn
            v-if="!$uiConfig.disableApplications"
            to="/new-application"
            :prepend-icon="mdiPlusCircle"
            color="accent"
            variant="outlined"
            height="40"
          >
            {{ t('createApplication') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-alert
      v-if="!organization"
      color="primary"
      :icon="mdiInformation"
      variant="outlined"
    >
      <i18n-t :keypath="user.organizations.length ? 'collaborativeMessage' : 'collaborativeMessageNoOrg'">
        <template #collaborativeMode>
          <strong>{{ t('collaborativeMode') }}</strong>
        </template>
        <template #yourAccountLink>
          <router-link to="/me">
            {{ t('yourAccount') }}
          </router-link>
        </template>
      </i18n-t>
    </v-alert>
    <v-alert
      v-else-if="!canContribDep"
      color="primary"
      :icon="mdiEyeOutline"
      variant="outlined"
      :title="t('readOnlyTitle', { name: organization.name })"
      :text="t('readOnlyText')"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  organizationSpace: Espace de l'organisation
  userSpace: Espace personnel
  hello: Bonjour {name}
  roles:
    admin: Administrateur
    contrib: Contributeur
    user: Utilisateur
  createDataset: Créer un jeu de données
  createApplication: Créer une application
  collaborativeMessage: Pour travailler en {collaborativeMode} vous devez ouvrir le menu personnel (en haut à droite) et changer de compte actif. Pour créer une nouvelle organisation rendez vous sur {yourAccountLink}.
  collaborativeMessageNoOrg: Pour travailler en {collaborativeMode} vous devez créer une organisation. Pour cela rendez vous sur {yourAccountLink}.
  collaborativeMode: mode collaboratif
  yourAccount: votre compte
  readOnlyTitle: Vous consultez les données de {name}
  readOnlyText: Votre rôle permet d'explorer, de filtrer et de télécharger les jeux de données et les applications.
en:
  organizationSpace: Organization space
  userSpace: Personal space
  hello: Hello {name}
  roles:
    admin: Administrator
    contrib: Contributor
    user: User
  createDataset: Create a dataset
  createApplication: Create an application
  collaborativeMessage: To work in {collaborativeMode} you must open the personal menu (top right) and change the active account. To create a new organization please visit {yourAccountLink}.
  collaborativeMessageNoOrg: To work in {collaborativeMode} you must create an organization. To do so please visit {yourAccountLink}.
  collaborativeMode: collaborative mode
  yourAccount: your account
  readOnlyTitle: You are browsing the data of {name}
  readOnlyText: Your role lets you explore, filter and download the datasets and applications.
</i18n>

<script setup lang="ts">
import { mdiPlusCircle, mdiInformation, mdiEyeOutline } from '@mdi/js'
import { usePermissions } from '~/composables/use-permissions'
import heroSvg from '~/assets/svg/Data Arranging_Two Color.svg?raw'

const { t } = useI18n()
const { user, organization } = useSessionAuthenticated()
const { canContribDep } = usePermissions()
</script>

