import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import LayoutWrapper from './LayoutWrapper.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: LayoutWrapper,
  enhanceApp({ app }) {
    // Global registrations if needed
  }
} satisfies Theme
