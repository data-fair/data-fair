import { classByOperation } from '@data-fair/data-fair-shared/permissions/operations.ts'

export type CapabilityResourceType = 'datasets' | 'applications'

const tierOrder = ['admin', 'write', 'manageOwnLines', 'read', 'list'] as const
export type CapabilityTier = typeof tierOrder[number]

/** Distinct permission classes granted by a list of operation ids. */
export const grantedClasses = (resourceType: CapabilityResourceType, userPermissions: string[]): string[] => {
  const classes = new Set<string>()
  for (const operation of userPermissions) {
    const operationClass = (classByOperation as Record<string, Record<string, string>>)[resourceType]?.[operation]
    if (operationClass) classes.add(operationClass)
  }
  return [...classes]
}

/** Highest access tier for a resource, derived from its userPermissions (null = nothing to show). */
export const capabilityTier = (resourceType: CapabilityResourceType, userPermissions: string[] | undefined): CapabilityTier | null => {
  if (!userPermissions?.length) return null
  const classes = new Set(grantedClasses(resourceType, userPermissions))
  for (const tier of tierOrder) {
    if (classes.has(tier)) return tier
  }
  return null
}
