<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import type { PlaygroundLink } from '#shared/types'

const props = defineProps<{
  links: PlaygroundLink[]
}>()

// Map provider id to icon class
const providerIcons: Record<string, string> = {
  'stackblitz': 'i-simple-icons-stackblitz',
  'codesandbox': 'i-simple-icons-codesandbox',
  'codepen': 'i-simple-icons-codepen',
  'replit': 'i-simple-icons-replit',
  'gitpod': 'i-simple-icons-gitpod',
  'vue-playground': 'i-simple-icons-vuedotjs',
  'nuxt-new': 'i-simple-icons-nuxtdotjs',
  'vite-new': 'i-simple-icons-vite',
  'jsfiddle': 'i-carbon-code',
}

// Map provider id to color class
const providerColors: Record<string, string> = {
  'stackblitz': 'text-provider-stackblitz',
  'codesandbox': 'text-provider-codesandbox',
  'codepen': 'text-provider-codepen',
  'replit': 'text-provider-replit',
  'gitpod': 'text-provider-gitpod',
  'vue-playground': 'text-provider-vue',
  'nuxt-new': 'text-provider-nuxt',
  'vite-new': 'text-provider-vite',
  'jsfiddle': 'text-provider-jsfiddle',
}

function getIcon(provider: string): string {
  return providerIcons[provider] || 'i-carbon-play'
}

function getColor(provider: string): string {
  return providerColors[provider] || 'text-fg-muted'
}

// Dropdown state
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement>()

onClickOutside(dropdownRef, () => {
  isOpen.value = false
})

// Single vs multiple
const hasSingleLink = computed(() => props.links.length === 1)
const hasMultipleLinks = computed(() => props.links.length > 1)
const firstLink = computed(() => props.links[0])
</script>

<template>
  <section v-if="links.length > 0" aria-labelledby="playgrounds-heading">
    <h2 id="playgrounds-heading" class="text-xs text-fg-subtle uppercase tracking-wider mb-3">
      Playgrounds
    </h2>

    <div ref="dropdownRef" class="relative">
      <!-- Single link: direct button -->
      <AppTooltip v-if="hasSingleLink && firstLink" :text="firstLink.providerName" class="w-full">
        <a
          :href="firstLink.url"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full flex items-center gap-2 px-3 py-2 text-sm font-mono bg-bg-muted border border-border rounded-md hover:border-border-hover hover:bg-bg-elevated transition-colors duration-200"
        >
          <span
            :class="[getIcon(firstLink.provider), getColor(firstLink.provider), 'w-4 h-4 shrink-0']"
            aria-hidden="true"
          />
          <span class="truncate text-fg-muted">{{ firstLink.label }}</span>
        </a>
      </AppTooltip>

      <!-- Multiple links: dropdown button -->
      <button
        v-if="hasMultipleLinks"
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-mono bg-bg-muted border border-border rounded-md hover:border-border-hover hover:bg-bg-elevated transition-colors duration-200"
        @click="isOpen = !isOpen"
      >
        <span class="flex items-center gap-2">
          <span class="i-carbon-play w-4 h-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <span class="text-fg-muted">{{ links.length }} Playgrounds</span>
        </span>
        <span
          class="i-carbon-chevron-down w-3 h-3 text-fg-subtle transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
          aria-hidden="true"
        />
      </button>

      <!-- Dropdown menu -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen && hasMultipleLinks"
          class="absolute top-full left-0 right-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1 overflow-visible"
        >
          <AppTooltip v-for="link in links" :key="link.url" :text="link.providerName" class="block">
            <a
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2 px-3 py-2 text-sm font-mono text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors duration-150"
              @click="isOpen = false"
            >
              <span
                :class="[getIcon(link.provider), getColor(link.provider), 'w-4 h-4 shrink-0']"
                aria-hidden="true"
              />
              <span class="truncate">{{ link.label }}</span>
            </a>
          </AppTooltip>
        </div>
      </Transition>
    </div>
  </section>
</template>
