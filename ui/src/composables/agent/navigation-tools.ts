import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import type { NavGroup } from '~/composables/layout/use-navigation-items'
import type { BreadcrumbItem } from '~/composables/layout/use-breadcrumbs'

const messages: Record<string, Record<string, string>> = {
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
  locale: Ref<string>
}

export function useAgentNavigationTools ({ route, router, navigationGroups, breadcrumbItems, locale }: AgentNavigationToolsDeps) {
  const t = (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key

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

      pagesByGroup.push(
        '**Workflow pages**:\n' +
        '- Create new dataset: /new-dataset\n' +
        '- Update existing dataset: /update-dataset\n' +
        '- Share/publish dataset: /share-dataset\n' +
        '- Create new application: /new-application'
      )

      pagesByGroup.push(
        '**Detail pages** (require an ID, use list_datasets or list_applications to find IDs):\n' +
        '- Dataset overview: /dataset/{id}\n' +
        '- Dataset data: /dataset/{id}/data\n' +
        '- Dataset table: /dataset/{id}/table\n' +
        '- Dataset map: /dataset/{id}/map\n' +
        '- Dataset files: /dataset/{id}/files\n' +
        '- Edit dataset data: /dataset/{id}/edit-data\n' +
        '- Edit dataset metadata: /dataset/{id}/edit-metadata\n' +
        '- Dataset thumbnails: /dataset/{id}/thumbnails\n' +
        '- Dataset revisions: /dataset/{id}/revisions\n' +
        '- Dataset API doc: /dataset/{id}/api-doc\n' +
        '- Application overview: /application/{id}\n' +
        '- Application config: /application/{id}/config\n' +
        '- Application API doc: /application/{id}/api-doc\n' +
        '- Remote service detail: /remote-services/{id}'
      )

      pagesByGroup.push(
        '**D-frame pages** (processings/catalogs, use list_processings or list_catalogs to find IDs):\n' +
        '- Processings list: /processings\n' +
        '- Processing detail: /processings/{id}\n' +
        '- Catalogs list: /catalogs\n' +
        '- Catalog detail: /catalogs/{id}'
      )

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
    description: 'Navigate to a page in the application. Use list_pages to discover available paths, and list_datasets, list_applications, list_processings, or list_catalogs to find resource IDs.',
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
