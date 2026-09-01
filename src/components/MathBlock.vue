<script setup>
import { computed } from 'vue'
import katex from 'katex'

const props = defineProps({
  latex: { type: String, default: '' },
  display: { type: Boolean, default: true }
})

const rendered = computed(() => {
  const src = props.latex?.trim()
  if (!src) return { html: '', empty: true, error: null }
  try {
    return {
      html: katex.renderToString(src, {
        displayMode: props.display,
        throwOnError: false,
        errorColor: '#e5484d',
        strict: false,
        trust: false,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
          '\\Z': '\\mathbb{Z}',
          '\\Q': '\\mathbb{Q}',
          '\\C': '\\mathbb{C}',
          '\\dd': '\\mathrm{d}',
          '\\eps': '\\varepsilon'
        }
      }),
      empty: false,
      error: null
    }
  } catch (err) {
    return { html: '', empty: false, error: err.message }
  }
})
</script>

<template>
  <div class="math-block">
    <div v-if="rendered.empty" class="math-placeholder">Double-click to write LaTeX</div>
    <div v-else-if="rendered.error" class="math-error">{{ rendered.error }}</div>
    <!-- KaTeX output is generated locally from the user's own input. -->
    <div v-else v-html="rendered.html" />
  </div>
</template>

<style scoped>
.math-block {
  display: inline-block;
  min-width: 40px;
}
.math-placeholder {
  color: var(--muted);
  font-size: 14px;
  font-style: italic;
  white-space: nowrap;
}
.math-error {
  color: #e5484d;
  font-size: 13px;
  font-family: var(--mono);
  max-width: 360px;
}
</style>
