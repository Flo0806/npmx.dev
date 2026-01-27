import type {
  OsvQueryResponse,
  OsvVulnerability,
  OsvSeverityLevel,
  PackageVulnerabilities,
  VulnerabilitySummary,
} from '#shared/types'
import { CACHE_MAX_AGE_ONE_HOUR } from '#shared/utils/constants'

interface PackageQuery {
  name: string
  version: string
}

interface VulnerabilitiesResponse {
  results: Record<string, PackageVulnerabilities>
}

/**
 * Query OSV for vulnerabilities in multiple packages.
 *
 * POST /api/osv/vulnerabilities
 * Body: { packages: [{ name: "lodash", version: "4.17.21" }, ...] }
 *
 * @returns { results: { "lodash": { count: 2, severity: "high", ... }, ... } }
 */
export default defineCachedEventHandler<Promise<VulnerabilitiesResponse>>(
  async event => {
    const body = await readBody<{ packages: PackageQuery[] }>(event)

    if (!body?.packages || !Array.isArray(body.packages)) {
      throw createError({
        statusCode: 400,
        message: 'Request body must contain a packages array',
      })
    }

    // Filter valid packages (non-empty name and version)
    const validPackages = body.packages.filter(
      pkg =>
        pkg.name && typeof pkg.name === 'string' && pkg.version && typeof pkg.version === 'string',
    )

    if (validPackages.length === 0) {
      return { results: {} }
    }

    // Query OSV for each package in parallel (with concurrency limit)
    const results: Record<string, PackageVulnerabilities> = {}
    const batchSize = 10

    for (let i = 0; i < validPackages.length; i += batchSize) {
      const batch = validPackages.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async pkg => {
          const info = await queryOsvForPackage(pkg.name, pkg.version)
          return { name: pkg.name, info }
        }),
      )

      for (const { name, info } of batchResults) {
        if (info) {
          results[name] = info
        }
      }
    }

    return { results }
  },
  {
    maxAge: CACHE_MAX_AGE_ONE_HOUR,
    swr: true,
    name: 'api-osv-vulnerabilities',
    getKey: async event => {
      const body = await readBody<{ packages: PackageQuery[] }>(event)
      if (!body?.packages) return 'osv:empty'
      // Create a stable cache key from sorted package list
      const sorted = [...body.packages]
        .filter(p => p.name && p.version)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `${p.name}@${p.version}`)
        .join(',')
      return `osv:v1:${sorted}`
    },
  },
)

async function queryOsvForPackage(
  name: string,
  version: string,
): Promise<PackageVulnerabilities | null> {
  try {
    const response = await $fetch<OsvQueryResponse>('https://api.osv.dev/v1/query', {
      method: 'POST',
      body: {
        package: {
          name,
          ecosystem: 'npm',
        },
        version,
      },
    })

    const vulns = response.vulns || []
    if (vulns.length === 0) {
      return null
    }

    // Transform to VulnerabilitySummary and count by severity
    const counts = { total: vulns.length, critical: 0, high: 0, moderate: 0, low: 0 }
    const vulnerabilities: VulnerabilitySummary[] = []

    // Sort by severity (critical first)
    const severityOrder: Record<OsvSeverityLevel, number> = {
      critical: 0,
      high: 1,
      moderate: 2,
      low: 3,
      unknown: 4,
    }
    const sortedVulns = [...vulns].sort(
      (a, b) => severityOrder[getSeverityLevel(a)] - severityOrder[getSeverityLevel(b)],
    )

    for (const vuln of sortedVulns) {
      const severity = getSeverityLevel(vuln)
      if (severity === 'critical') counts.critical++
      else if (severity === 'high') counts.high++
      else if (severity === 'moderate') counts.moderate++
      else if (severity === 'low') counts.low++

      vulnerabilities.push({
        id: vuln.id,
        summary: vuln.summary || 'No description available',
        severity,
        aliases: vuln.aliases || [],
        url: getVulnerabilityUrl(vuln),
      })
    }

    return {
      package: name,
      version,
      vulnerabilities,
      counts,
    }
  } catch {
    // Silently fail for individual packages
    return null
  }
}

function getVulnerabilityUrl(vuln: OsvVulnerability): string {
  if (vuln.id.startsWith('GHSA-')) {
    return `https://github.com/advisories/${vuln.id}`
  }
  const cveAlias = vuln.aliases?.find(a => a.startsWith('CVE-'))
  if (cveAlias) {
    return `https://nvd.nist.gov/vuln/detail/${cveAlias}`
  }
  return `https://osv.dev/vulnerability/${vuln.id}`
}

function getSeverityLevel(vuln: OsvVulnerability): OsvSeverityLevel {
  // First check database_specific severity
  const dbSeverity = vuln.database_specific?.severity?.toLowerCase()
  if (dbSeverity) {
    if (dbSeverity === 'critical') return 'critical'
    if (dbSeverity === 'high') return 'high'
    if (dbSeverity === 'moderate' || dbSeverity === 'medium') return 'moderate'
    if (dbSeverity === 'low') return 'low'
  }

  // Fall back to CVSS score
  const severityEntry = vuln.severity?.[0]
  if (severityEntry?.score) {
    const match = severityEntry.score.match(/(?:^|[/:])(\d+(?:\.\d+)?)$/)
    if (match?.[1]) {
      const score = parseFloat(match[1])
      if (score >= 9.0) return 'critical'
      if (score >= 7.0) return 'high'
      if (score >= 4.0) return 'moderate'
      if (score > 0) return 'low'
    }
  }

  return 'unknown'
}
