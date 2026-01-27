<script setup lang="ts">
import { SEVERITY_LEVELS } from '~~/shared/types'
import { SEVERITY_COLORS } from '~~/shared/utils/severity'

const props = defineProps<{
  packageName: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  optionalDependencies?: Record<string, string>
}>()

// Fetch outdated info for dependencies
const outdatedDeps = useOutdatedDependencies(() => props.dependencies)

// Fetch vulnerability info for dependencies
const vulnerableDeps = useVulnerableDependencies(() => props.dependencies)

// Expanded state for each section
const depsExpanded = shallowRef(false)
const peerDepsExpanded = shallowRef(false)
const optionalDepsExpanded = shallowRef(false)

// Sort dependencies alphabetically
const sortedDependencies = computed(() => {
  if (!props.dependencies) return []
  return Object.entries(props.dependencies).sort(([a], [b]) => a.localeCompare(b))
})

// Sort peer dependencies alphabetically, with required first then optional
const sortedPeerDependencies = computed(() => {
  if (!props.peerDependencies) return []

  return Object.entries(props.peerDependencies)
    .map(([name, version]) => ({
      name,
      version,
      optional: props.peerDependenciesMeta?.[name]?.optional ?? false,
    }))
    .sort((a, b) => {
      // Required first, then optional
      if (a.optional !== b.optional) return a.optional ? 1 : -1
      return a.name.localeCompare(b.name)
    })
})

// Sort optional dependencies alphabetically
const sortedOptionalDependencies = computed(() => {
  if (!props.optionalDependencies) return []
  return Object.entries(props.optionalDependencies).sort(([a], [b]) => a.localeCompare(b))
})

// Vulnerability summary for banner
const vulnerabilitySummary = computed(() => {
  const deps = Object.values(vulnerableDeps.value)
  if (deps.length === 0) return null

  const counts = { critical: 0, high: 0, moderate: 0, low: 0 }
  let total = 0

  for (const info of deps) {
    if (!info?.counts) continue
    total += info.counts.total || 0
    for (const s of SEVERITY_LEVELS) counts[s] += info.counts[s] || 0
  }

  const severity = SEVERITY_LEVELS.find(s => counts[s] > 0) || 'low'

  return { affectedDeps: deps.length, totalVulns: total, severity, counts }
})

const vulnBreakdownText = computed(() => {
  if (!vulnerabilitySummary.value) return ''
  const { counts } = vulnerabilitySummary.value
  return SEVERITY_LEVELS.filter(s => counts[s])
    .map(s => `${counts[s]} ${s}`)
    .join(', ')
})
</script>

<template>
  <div class="space-y-8">
    <!-- Vulnerability warning banner -->
    <div
      v-if="vulnerabilitySummary"
      role="alert"
      class="rounded-lg border px-4 py-3 cursor-help"
      :class="SEVERITY_COLORS[vulnerabilitySummary.severity]"
      :title="`${vulnerabilitySummary.affectedDeps} ${vulnerabilitySummary.affectedDeps === 1 ? 'dependency' : 'dependencies'} affected`"
    >
      <div class="flex items-center gap-2">
        <span class="i-carbon-security w-4 h-4 shrink-0" aria-hidden="true" />
        <div>
          <div class="font-mono text-sm">
            {{ vulnerabilitySummary.totalVulns }}
            {{ vulnerabilitySummary.totalVulns === 1 ? 'vulnerability' : 'vulnerabilities' }}
          </div>
          <div class="font-mono text-xs opacity-70">{{ vulnBreakdownText }}</div>
        </div>
      </div>
    </div>

    <!-- Dependencies -->
    <section v-if="sortedDependencies.length > 0" aria-labelledby="dependencies-heading">
      <h2 id="dependencies-heading" class="text-xs text-fg-subtle uppercase tracking-wider mb-3">
        {{ $t('package.dependencies.title', { count: sortedDependencies.length }) }}
      </h2>
      <ul class="space-y-1 list-none m-0 p-0" :aria-label="$t('package.dependencies.list_label')">
        <li
          v-for="[dep, version] in sortedDependencies.slice(0, depsExpanded ? undefined : 10)"
          :key="dep"
          class="flex items-center justify-between py-1 text-sm gap-2"
        >
          <NuxtLink
            :to="{ name: 'package', params: { package: dep.split('/') } }"
            class="font-mono text-fg-muted hover:text-fg transition-colors duration-200 truncate min-w-0"
          >
            {{ dep }}
          </NuxtLink>
          <span class="flex items-center gap-1">
            <span
              v-if="outdatedDeps[dep]"
              class="shrink-0"
              :class="getVersionClass(outdatedDeps[dep])"
              :title="getOutdatedTooltip(outdatedDeps[dep])"
              aria-hidden="true"
            >
              <span class="i-carbon-warning-alt w-3 h-3 block" />
            </span>
            <NuxtLink
              v-if="vulnerableDeps[dep]?.version"
              :to="{
                name: 'package',
                params: { package: [...dep.split('/'), 'v', vulnerableDeps[dep].version] },
              }"
              class="shrink-0"
              :class="getVulnerabilitySeverityClass(vulnerableDeps[dep])"
              :title="getVulnerabilityTooltip(vulnerableDeps[dep])"
            >
              <span class="i-carbon-security w-3 h-3 block" aria-hidden="true" />
              <span class="sr-only">View vulnerabilities</span>
            </NuxtLink>
            <NuxtLink
              :to="{ name: 'package', params: { package: [...dep.split('/'), 'v', version] } }"
              class="font-mono text-xs text-right truncate"
              :class="getVersionClass(outdatedDeps[dep])"
              :title="outdatedDeps[dep] ? getOutdatedTooltip(outdatedDeps[dep]) : version"
            >
              {{ version }}
            </NuxtLink>
            <span v-if="outdatedDeps[dep]" class="sr-only">
              ({{ getOutdatedTooltip(outdatedDeps[dep]) }})
            </span>
            <span v-if="vulnerableDeps[dep]" class="sr-only">
              ({{ getVulnerabilityTooltip(vulnerableDeps[dep]) }})
            </span>
          </span>
        </li>
      </ul>
      <button
        v-if="sortedDependencies.length > 10 && !depsExpanded"
        type="button"
        class="mt-2 font-mono text-xs text-fg-muted hover:text-fg transition-colors duration-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
        @click="depsExpanded = true"
      >
        {{ $t('package.dependencies.show_all', { count: sortedDependencies.length }) }}
      </button>
    </section>

    <!-- Peer Dependencies -->
    <section v-if="sortedPeerDependencies.length > 0" aria-labelledby="peer-dependencies-heading">
      <h2
        id="peer-dependencies-heading"
        class="text-xs text-fg-subtle uppercase tracking-wider mb-3"
      >
        {{ $t('package.peer_dependencies.title', { count: sortedPeerDependencies.length }) }}
      </h2>
      <ul
        class="space-y-1 list-none m-0 p-0"
        :aria-label="$t('package.peer_dependencies.list_label')"
      >
        <li
          v-for="peer in sortedPeerDependencies.slice(0, peerDepsExpanded ? undefined : 10)"
          :key="peer.name"
          class="flex items-center justify-between py-1 text-sm gap-2"
        >
          <div class="flex items-center gap-2 min-w-0">
            <NuxtLink
              :to="{ name: 'package', params: { package: peer.name.split('/') } }"
              class="font-mono text-fg-muted hover:text-fg transition-colors duration-200 truncate"
            >
              {{ peer.name }}
            </NuxtLink>
            <span
              v-if="peer.optional"
              class="px-1 py-0.5 font-mono text-[10px] text-fg-subtle bg-bg-muted border border-border rounded shrink-0"
              :title="$t('package.dependencies.optional')"
            >
              {{ $t('package.dependencies.optional') }}
            </span>
          </div>
          <NuxtLink
            :to="{
              name: 'package',
              params: { package: [...peer.name.split('/'), 'v', peer.version] },
            }"
            class="font-mono text-xs text-fg-subtle max-w-[40%] text-right truncate"
            :title="peer.version"
          >
            {{ peer.version }}
          </NuxtLink>
        </li>
      </ul>
      <button
        v-if="sortedPeerDependencies.length > 10 && !peerDepsExpanded"
        type="button"
        class="mt-2 font-mono text-xs text-fg-muted hover:text-fg transition-colors duration-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
        @click="peerDepsExpanded = true"
      >
        {{ $t('package.peer_dependencies.show_all', { count: sortedPeerDependencies.length }) }}
      </button>
    </section>

    <!-- Optional Dependencies -->
    <section
      v-if="sortedOptionalDependencies.length > 0"
      aria-labelledby="optional-dependencies-heading"
    >
      <h2
        id="optional-dependencies-heading"
        class="text-xs text-fg-subtle uppercase tracking-wider mb-3"
      >
        {{
          $t('package.optional_dependencies.title', { count: sortedOptionalDependencies.length })
        }}
      </h2>
      <ul
        class="space-y-1 list-none m-0 p-0"
        :aria-label="$t('package.optional_dependencies.list_label')"
      >
        <li
          v-for="[dep, version] in sortedOptionalDependencies.slice(
            0,
            optionalDepsExpanded ? undefined : 10,
          )"
          :key="dep"
          class="flex items-center justify-between py-1 text-sm gap-2"
        >
          <NuxtLink
            :to="{ name: 'package', params: { package: dep.split('/') } }"
            class="font-mono text-fg-muted hover:text-fg transition-colors duration-200 truncate min-w-0"
          >
            {{ dep }}
          </NuxtLink>
          <NuxtLink
            :to="{ name: 'package', params: { package: [...dep.split('/'), 'v', version] } }"
            class="font-mono text-xs text-fg-subtle max-w-[50%] text-right truncate"
            :title="version"
          >
            {{ version }}
          </NuxtLink>
        </li>
      </ul>
      <button
        v-if="sortedOptionalDependencies.length > 10 && !optionalDepsExpanded"
        type="button"
        class="mt-2 font-mono text-xs text-fg-muted hover:text-fg transition-colors duration-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
        @click="optionalDepsExpanded = true"
      >
        {{
          $t('package.optional_dependencies.show_all', { count: sortedOptionalDependencies.length })
        }}
      </button>
    </section>
  </div>
</template>
