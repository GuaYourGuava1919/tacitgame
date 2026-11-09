import { ref, watch } from 'vue'
import { save } from './net'

export type ThemeMode = 'system' | 'light' | 'dark'

function initial(): ThemeMode {
  try {
    const v = localStorage.getItem('lx.theme')
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export const theme = ref<ThemeMode>(initial())

function apply(mode: ThemeMode) {
  const el = document.documentElement
  if (mode === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', mode)
  save('lx.theme', mode)
}

apply(theme.value)
watch(theme, apply)

export function cycleTheme() {
  const order: ThemeMode[] = ['system', 'light', 'dark']
  theme.value = order[(order.indexOf(theme.value) + 1) % order.length]
}
