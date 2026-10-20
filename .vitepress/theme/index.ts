import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import LayoutWrapper from './LayoutWrapper.vue'
import MermaidViewer from './MermaidViewer.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: LayoutWrapper,
  enhanceApp({ app }) {
    app.component('MermaidViewer', MermaidViewer)
  }
} satisfies Theme
