import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import type { NavGroup } from '~/composables/use-navigation-items'
import type { BreadcrumbItem } from '~/composables/use-breadcrumbs'

interface AgentNavigationToolsDeps {
  route: RouteLocationNormalizedLoaded
  router: Router
  navigationGroups: ComputedRef<NavGroup[]>
  breadcrumbItems: Ref<BreadcrumbItem[]>
}

export function useAgentNavigationTools ({ route, router, navigationGroups, breadcrumbItems }: AgentNavigationToolsDeps) {
  useAgentTool({
    name: 'get_current_location',
    description: 'Get the current page location in the application, including route path, name, parameters, and breadcrumbs.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: route.path,
            name: route.name,
            params: route.params,
            query: route.query,
            breadcrumbs: breadcrumbItems.value.map(b => ({
              text: b.text,
              to: b.to
            }))
          })
        }]
      }
    }
  })

  useAgentTool({
    name: 'list_pages',
    description: 'List all available pages in the application that the current user can access, organized by group (content, management, connectors, monitoring, help, admin).',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const pages = navigationGroups.value.flatMap(group =>
        group.items
          .filter(item => item.to)
          .map(item => ({
            group: group.title,
            title: item.title,
            path: item.to,
            subtitle: item.subtitle
          }))
      )
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(pages)
        }]
      }
    }
  })

  useAgentTool({
    name: 'navigate',
    description: 'Navigate to a page in the application. Use list_pages to discover available paths.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to navigate to (e.g. "/datasets", "/dataset/abc123")'
        }
      },
      required: ['path']
    },
    execute: async (params) => {
      try {
        await router.push(params.path)
        await new Promise(resolve => setTimeout(resolve, 500))
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, newPath: router.currentRoute.value.path })
          }]
        }
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, error: error.message })
          }]
        }
      }
    }
  })
}
