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
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const },
        name: { type: 'string' as const },
        params: { type: 'object' as const, properties: {} },
        query: { type: 'object' as const, properties: {} },
        breadcrumbs: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              text: { type: 'string' as const },
              to: { type: 'string' as const }
            }
          }
        }
      }
    },
    execute: async () => ({
      path: route.path,
      name: route.name as string,
      params: { ...route.params },
      query: { ...route.query },
      breadcrumbs: breadcrumbItems.value.map(b => ({
        text: b.text,
        to: typeof b.to === 'string' ? b.to : b.to?.path ?? ''
      }))
    })
  })

  useAgentTool({
    name: 'list_pages',
    description: 'List all available pages in the application that the current user can access, organized by group (content, management, connectors, monitoring, help, admin).',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        pages: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              group: { type: 'string' as const },
              title: { type: 'string' as const },
              path: { type: 'string' as const },
              subtitle: { type: 'string' as const }
            }
          }
        }
      }
    },
    execute: async () => ({
      pages: navigationGroups.value.flatMap(group =>
        group.items
          .filter(item => item.to)
          .map(item => ({
            group: group.title,
            title: item.title,
            path: item.to!,
            subtitle: item.subtitle ?? ''
          }))
      )
    })
  })

  useAgentTool({
    name: 'navigate',
    description: 'Navigate to a page in the application. Use list_pages to discover available paths.',
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
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' as const },
        newPath: { type: 'string' as const },
        error: { type: 'string' as const }
      }
    },
    execute: async (params) => {
      try {
        await router.push(params.path)
        // Wait for the target page to mount and register contextual tools
        await new Promise(resolve => setTimeout(resolve, 500))
        return { success: true, newPath: router.currentRoute.value.path }
      } catch (error: any) {
        return { success: false, newPath: '', error: error.message }
      }
    }
  })
}
