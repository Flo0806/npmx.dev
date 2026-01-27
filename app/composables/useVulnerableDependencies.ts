import type { PackageVulnerabilities, OsvSeverityLevel } from '#shared/types'
import { maxSatisfying, prerelease } from 'semver'
import {
  fetchCachedPackument,
  constraintIncludesPrerelease,
  isNonSemverConstraint,
} from './useNpmRegistry'

interface ResolvedPackage {
  name: string
  version: string
}

/**
 * Composable to check for vulnerabilities in dependencies.
 * Returns a reactive map of dependency name to vulnerability info.
 */
export function useVulnerableDependencies(
  dependencies: MaybeRefOrGetter<Record<string, string> | undefined>,
) {
  const vulnerable = shallowRef<Record<string, PackageVulnerabilities>>({})

  async function checkVulnerabilities(deps: Record<string, string> | undefined) {
    if (!deps || Object.keys(deps).length === 0) {
      vulnerable.value = {}
      return
    }

    // Resolve constraints to versions
    const entries = Object.entries(deps)
    const resolved: ResolvedPackage[] = []

    // Resolve in batches to avoid overwhelming the npm registry
    const batchSize = 5
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async ([name, constraint]) => {
          const version = await resolveConstraint(name, constraint)
          return version ? { name, version } : null
        }),
      )

      for (const result of batchResults) {
        if (result) {
          resolved.push(result)
        }
      }
    }

    if (resolved.length === 0) {
      vulnerable.value = {}
      return
    }

    // Query our OSV API
    try {
      const response = await $fetch<{
        results: Record<string, PackageVulnerabilities>
      }>('/api/osv/vulnerabilities', {
        method: 'POST',
        body: { packages: resolved },
      })

      vulnerable.value = response.results
    } catch {
      // Silently fail - don't break the UI
      vulnerable.value = {}
    }
  }

  watch(
    () => toValue(dependencies),
    deps => {
      checkVulnerabilities(deps)
    },
    { immediate: true },
  )

  return vulnerable
}

async function resolveConstraint(packageName: string, constraint: string): Promise<string | null> {
  // Skip non-semver constraints
  if (isNonSemverConstraint(constraint)) {
    return null
  }

  const packument = await fetchCachedPackument(packageName)
  if (!packument) return null

  if (constraint === 'latest') {
    return packument['dist-tags']?.latest ?? null
  }

  let versions = Object.keys(packument.versions)
  const includesPrerelease = constraintIncludesPrerelease(constraint)

  if (!includesPrerelease) {
    versions = versions.filter(v => !prerelease(v))
  }

  return maxSatisfying(versions, constraint)
}

/**
 * Get tooltip text for a vulnerable dependency
 */
export function getVulnerabilityTooltip(info: PackageVulnerabilities): string {
  const parts: string[] = []
  if (info.counts.critical > 0) parts.push(`${info.counts.critical} critical`)
  if (info.counts.high > 0) parts.push(`${info.counts.high} high`)
  if (info.counts.moderate > 0) parts.push(`${info.counts.moderate} moderate`)
  if (info.counts.low > 0) parts.push(`${info.counts.low} low`)

  const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  const plural = info.counts.total === 1 ? 'vulnerability' : 'vulnerabilities'

  // Add vulnerability IDs (max 3)
  const ids =
    info.vulnerabilities
      ?.slice(0, 3)
      .map(v => v.id)
      .join(', ') || ''
  const idsSuffix = ids ? `\n${ids}` : ''

  return `${info.counts.total} ${plural}${breakdown}${idsSuffix}`
}

/**
 * Get highest severity from a PackageVulnerabilities
 */
export function getHighestSeverity(info: PackageVulnerabilities): OsvSeverityLevel {
  if (info.counts.critical > 0) return 'critical'
  if (info.counts.high > 0) return 'high'
  if (info.counts.moderate > 0) return 'moderate'
  if (info.counts.low > 0) return 'low'
  return 'unknown'
}

/**
 * Get CSS class for vulnerability severity
 */
export function getVulnerabilitySeverityClass(info: PackageVulnerabilities): string {
  const severityClasses: Record<OsvSeverityLevel, string> = {
    critical: 'text-red-500',
    high: 'text-orange-500',
    moderate: 'text-yellow-500',
    low: 'text-blue-500',
    unknown: 'text-fg-subtle',
  }
  return severityClasses[getHighestSeverity(info)]
}
