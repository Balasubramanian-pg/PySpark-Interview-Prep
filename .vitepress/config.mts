import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

// Read precomputed sidebar
let sidebarData: Record<string, any[]> = {}
try {
  const raw = fs.readFileSync(path.resolve(__dirname, 'sidebar.json'), 'utf-8')
  sidebarData = JSON.parse(raw)
} catch (e) {
  sidebarData = {}
}

const unifiedSidebar = [
  {
    text: '1. Fundamentals',
    collapsed: false,
    items: sidebarData['/1. Fundamentals/'] || []
  },
  {
    text: '2. Intermediate',
    collapsed: true,
    items: sidebarData['/2. Intermediate/'] || []
  },
  {
    text: '3. Advanced',
    collapsed: true,
    items: sidebarData['/3. Advanced/'] || []
  },
  {
    text: '4. Senior Dev',
    collapsed: true,
    items: sidebarData['/4. Senior Dev/'] || []
  }
]

export default defineConfig({
  title: 'PySpark Interview Prep',
  description: 'Enterprise-grade PySpark interview preparation wiki and certification learning hub',
  base: '/PySpark-Interview-Prep/',
  
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400..700;1,400..700&family=Jost:ital,wght@0,300..900;1,300..900&display=swap' }],
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['meta', { name: 'author', content: 'Balasubramanian PG' }],
    ['meta', { property: 'og:title', content: 'PySpark Interview Prep Wiki' }],
    ['meta', { property: 'og:description', content: '260+ Curated PySpark Interview Questions, Architecture Diagrams, and Interactive Study Engine' }]
  ],

  themeConfig: {
    siteTitle: 'PySpark Wiki',
    logo: {
      light: '/spark-logo.svg',
      dark: '/spark-logo.svg',
      alt: 'PySpark Wiki'
    },
    nav: [
      { text: 'Fundamentals', link: '/1. Fundamentals/1.1 Spark Architecture Basics/1.1.1 What is the role of the Spark Driver' },
      { text: 'Intermediate', link: '/2. Intermediate/2.1 Joins And Join Types/2.1.1 What are the different types of joins supported in PySpark' },
      { text: 'Advanced', link: '/3. Advanced/3.1 Partitioning And Bucketing/3.1.1 What is the difference between partitioning and bucketing' },
      { text: 'Senior Dev', link: '/4. Senior Dev/4.1 Memory Management And OOM Errors/4.1.1 How does PySpark manage JVM off-heap and on-heap memory' }
    ],
    sidebar: {
      '/1. Fundamentals/': unifiedSidebar,
      '/2. Intermediate/': unifiedSidebar,
      '/3. Advanced/': unifiedSidebar,
      '/4. Senior Dev/': unifiedSidebar
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Balasubramanian-pg/PySpark-Interview-Prep' }
    ],
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
    footer: {
      message: 'Zero-backend, client-first interactive learning portal for PySpark engineers.',
      copyright: 'Maintained by Balasubramanian PG'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    config: (md) => {
      const defaultFence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const info = token.info.trim()
        if (info === 'mermaid') {
          const rawCode = token.content
          const encodedCode = encodeURIComponent(rawCode)
          return `<MermaidViewer raw-code="${encodedCode}" />\n`
        }
        return defaultFence(tokens, idx, options, env, self)
      }
    }
  },

  vite: {
    plugins: [
      {
        name: 'escape-vue-mustache',
        enforce: 'pre',
        transform(code, id) {
          // Prevent Vue compiler from interpreting double curly braces in markdown files as JS expressions
          if (id.endsWith('.md') && !id.endsWith('index.md')) {
            return code
              .replace(/\{\{/g, '&#123;&#123;')
              .replace(/\}\}/g, '&#125;&#125;')
          }
        }
      }
    ]
  }
})
