<script setup lang="ts">
import type { OsvSeverityLevel, PackageVulnerabilities } from '#shared/types'

const props = defineProps<{
  packageName: string
  version: string
}>()

const { data: vulnData, status } = useLazyAsyncData(
  `osv-${props.packageName}@${props.version}`,
  async () => {
    const response = await $fetch<{ results: Record<string, PackageVulnerabilities> }>(
      '/api/osv/vulnerabilities',
      {
        method: 'POST',
        body: {
          packages: [{ name: props.packageName, version: props.version }],
        },
      },
    )

    const result = response.results[props.packageName]
    if (!result) {
      return {
        vulnerabilities: [],
        counts: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 },
      }
    }

    return { vulnerabilities: result.vulnerabilities, counts: result.counts }
  },
  {
    default: () => ({
      vulnerabilities: [],
      counts: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 },
    }),
  },
)

const hasVulnerabilities = computed(() => vulnData.value.counts.total > 0)

// Severity color classes for the banner
const severityColors: Record<OsvSeverityLevel, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  moderate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  unknown: 'text-fg-muted bg-bg-subtle border-border',
}

// Severity badge styles - greyscale theme matching the design system
const severityBadgeColors: Record<OsvSeverityLevel, string> = {
  critical: 'bg-bg-muted border border-border text-fg',
  high: 'bg-bg-muted border border-border text-fg-muted',
  moderate: 'bg-bg-muted border border-border text-fg-muted',
  low: 'bg-bg-muted border border-border text-fg-subtle',
  unknown: 'bg-bg-muted border border-border text-fg-subtle',
}

// Expand/collapse state
const isExpanded = shallowRef(false)

// Get highest severity for banner color
const highestSeverity = computed<OsvSeverityLevel>(() => {
  const counts = vulnData.value.counts
  if (counts.critical > 0) return 'critical'
  if (counts.high > 0) return 'high'
  if (counts.moderate > 0) return 'moderate'
  if (counts.low > 0) return 'low'
  return 'unknown'
})

// Summary text for collapsed view
const summaryText = computed(() => {
  const counts = vulnData.value.counts
  const parts: string[] = []
  if (counts.critical > 0)
    parts.push(`${counts.critical} ${$t('package.vulnerabilities.severity.critical')}`)
  if (counts.high > 0) parts.push(`${counts.high} ${$t('package.vulnerabilities.severity.high')}`)
  if (counts.moderate > 0)
    parts.push(`${counts.moderate} ${$t('package.vulnerabilities.severity.moderate')}`)
  if (counts.low > 0) parts.push(`${counts.low} ${$t('package.vulnerabilities.severity.low')}`)
  return parts.join(', ')
})
</script>

<template>
  <div v-if="status === 'success' && hasVulnerabilities" class="mb-6">
    <!-- Collapsible vulnerability banner -->
    <div
      role="alert"
      class="rounded-lg border overflow-hidden"
      :class="severityColors[highestSeverity]"
    >
      <!-- Header (always visible, clickable to expand) -->
      <button
        type="button"
        class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/50"
        :aria-expanded="isExpanded"
        aria-controls="vulnerability-details"
        @click="isExpanded = !isExpanded"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="i-carbon-warning-alt w-4 h-4 shrink-0" aria-hidden="true" />
          <span class="font-mono text-sm font-medium truncate">
            {{
              $t(
                'package.vulnerabilities.found',
                { count: vulnData.counts.total },
                vulnData.counts.total,
              )
            }}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs opacity-80 hidden sm:inline">{{ summaryText }}</span>
          <span
            class="i-carbon-chevron-down w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-180': isExpanded }"
            aria-hidden="true"
          />
        </div>
      </button>

      <!-- Expandable details - neutral background for better contrast -->
      <div
        v-show="isExpanded"
        id="vulnerability-details"
        class="border-t border-border bg-bg-subtle"
      >
        <ul class="divide-y divide-border list-none m-0 p-0">
          <li
            v-for="vuln in vulnData.vulnerabilities"
            :key="vuln.id"
            class="px-4 py-3 hover:bg-bg-muted transition-colors duration-200"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <a
                    :href="vuln.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 rounded"
                  >
                    {{ vuln.id }}
                  </a>
                  <span
                    class="px-2 py-0.5 text-xs font-mono rounded"
                    :class="severityBadgeColors[vuln.severity]"
                  >
                    {{ vuln.severity }}
                  </span>
                </div>
                <p class="text-sm text-fg-muted line-clamp-2 m-0">
                  {{ vuln.summary }}
                </p>
                <div v-if="vuln.aliases.length > 0" class="mt-1">
                  <span
                    v-for="alias in vuln.aliases.slice(0, 2)"
                    :key="alias"
                    class="text-xs text-fg-subtle mr-2"
                  >
                    {{ alias }}
                  </span>
                </div>
              </div>
              <a
                :href="vuln.url"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 p-1.5 text-fg-subtle hover:text-fg transition-colors duration-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
                :aria-label="$t('package.vulnerabilities.view_details')"
              >
                <span class="i-carbon-launch w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
