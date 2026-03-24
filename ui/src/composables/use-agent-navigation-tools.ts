import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import type { NavGroup } from '~/composables/use-navigation-items'
import type { BreadcrumbItem } from '~/composables/use-breadcrumbs'

const messages = {
  fr: {
    getCurrentLocation: 'Obtenir la localisation actuelle',
    listPages: 'Lister les pages',
    navigateToPage: 'Naviguer vers une page'
  },
  en: {
    getCurrentLocation: 'Get current location',
    listPages: 'List pages',
    navigateToPage: 'Navigate to page'
  }
}

interface AgentNavigationToolsDeps {
  route: RouteLocationNormalizedLoaded
  router: Router
  navigationGroups: ComputedRef<NavGroup[]>
  breadcrumbItems: Ref<BreadcrumbItem[]>
}

export function useAgentNavigationTools ({ route, router, navigationGroups, breadcrumbItems }: AgentNavigationToolsDeps) {
  const { t } = useI18n({ messages })

  useAgentTool({
    name: 'get_current_location',
    description: 'Get the current page location in the application, including route path, name, parameters, and breadcrumbs.',
    annotations: { title: t('getCurrentLocation'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const breadcrumbs = breadcrumbItems.value.map(b => `- ${b.text}: ${typeof b.to === 'string' ? b.to : b.to?.path ?? ''}`).join('\n')
      return {
        content: [{
          type: 'text' as const,
          text: `**Path**: ${route.path}\n**Name**: ${route.name as string}\n**Params**: ${JSON.stringify({ ...route.params })}\n**Query**: ${JSON.stringify({ ...route.query })}\n**Breadcrumbs**:\n${breadcrumbs}`
        }]
      }
    }
  })

  useAgentTool({
    name: 'list_pages',
    description: 'List all available pages in the application that the current user can access, organized by group (content, management, connectors, monitoring, help, admin).',
    annotations: { title: t('listPages'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      const pagesByGroup = navigationGroups.value.reduce((acc, group) => {
        const items = group.items.filter(item => item.to).map(item => `- ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''}: ${item.to}`)
        if (items.length > 0) {
          acc.push(`**${group.title}**:\n${items.join('\n')}`)
        }
        return acc
      }, [] as string[])
      return {
        content: [{
          type: 'text' as const,
          text: pagesByGroup.join('\n')
        }]
      }
    }
  })

  useAgentTool({
    name: 'navigate',
    description: 'Navigate to a page in the application. Use list_pages to discover available paths.',
    annotations: { title: t('navigateToPage') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'The path to navigate to (e.g. "/datasets", "/dataset/abc123")'
        }
      },
      required: ['path'] as const
    },
    execute: async (params) => {
      try {
        await router.push(params.path)
        await new Promise(resolve => setTimeout(resolve, 500))
        return {
          content: [{
            type: 'text' as const,
            text: `**Success**: true\n**New Path**: ${router.currentRoute.value.path}`
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: 'text' as const,
            text: `**Success**: false\n**Error**: ${error.message}`
          }],
          isError: true
        }
      }
    }
  })
}
