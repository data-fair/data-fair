import Vue from 'vue'

import Home from './pages/Home.vue'
import Datasets from './pages/Datasets.vue'
import Dataset from './pages/Dataset.vue'
import RemoteServices from './pages/RemoteServices.vue'
import RemoteService from './pages/RemoteService.vue'
import Applications from './pages/Applications.vue'
import Application from './pages/Application.vue'
import Settings from './pages/Settings.vue'
import ApiDoc from './ApiDoc.vue'

export default [{
  path: '/',
  name: 'Home',
  component: Home
}, {
  path: '/datasets',
  name: 'Datasets',
  component: Datasets
}, {
  path: '/dataset/:datasetId',
  name: 'Dataset',
  component: Dataset
}, {
  path: '/remote-services',
  name: 'RemoteServices',
  component: RemoteServices
}, {
  path: '/remote-service/:remoteServiceId',
  name: 'RemoteService',
  component: RemoteService
}, {
  path: '/applications',
  name: 'Applications',
  component: Applications
}, {
  path: '/application/:applicationId',
  name: 'Application',
  component: Application
}, {
  path: '/settings/:type/:id',
  name: 'Settings',
  component: Settings
}, {
  path: '/api-doc',
  name: 'ApiDoc',
  component: ApiDoc
}, {
  path: '/signin',
  name: 'Signin',
  redirect: to => {
    Vue.cookie.set('id_token', to.query.id_token, 30)
    return {
      path: '/',
      query: null
    }
  }
}]
