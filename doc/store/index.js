import Vue from 'vue'
import Vuex from 'vuex'
const marked = require('@hackmd/meta-marked')

Vue.use(Vuex)

export default () => {
  return new Vuex.Store({
    state: {
      env: {},
      chapters: [
        {
          id: 'functional-presentation'
        },
        {
          id: 'user-guide-backoffice'
        },
        {
          id: 'user-guide-frontoffice'
        },
        {
          id: 'lessons'
        },
        {
          id: 'technical-architecture'
        },
        {
          id: 'interoperate'
        },
        {
          id: 'install'
        }
      ]
    },
    getters: {
      navContent (state) {
        return (locale) => {
          const context = require.context('../pages/', true, /\.md$/)
          const content = context.keys()
            .filter(k => {
              if (k.startsWith('./install')) return true
              if (k.startsWith('./interoperate')) return true
              if (k.startsWith('./lessons')) return true
              if (k.startsWith('./technical-architecture')) return true
              return k.includes(`-${locale}.md`)
            })
            .map(k => Object.assign(marked(context(k).default).meta || {}, {
              chapter: k.split('/')[1],
              id: k.split('/')[2].split('.').shift().replace(`-${locale}`, '')
            }))
            .filter(section => section.published || !process.env.hideDraft)
          content.sort((s1, s2) => {
            if (state.chapters.findIndex(c => c.id === s1.chapter) < state.chapters.findIndex(c => c.id === s2.chapter)) return -1
            else if (state.chapters.findIndex(c => c.id === s1.chapter) > state.chapters.findIndex(c => c.id === s2.chapter)) return 1
            else if (s1.section && !s2.section) return -1
            else if (!s1.section && s2.section) return 1
            else if (s1.section < s2.section) return -1
            else if (s1.section > s2.section) return 1
            else if (s1.subsection && !s2.subsection) return -1
            else if (!s1.subsection && s2.subsection) return 1
            else if (s1.subsection < s2.subsection) return -1
            else return 1
          })
          return content
        }
      }
    },
    mutations: {
      setAny (state, params) {
        Object.assign(state, params)
      }
    },
    actions: {
      nuxtServerInit ({ commit, dispatch }, { req, env, app }) {
        commit('setAny', { env: { ...env } })
      }
    }
  })
}
