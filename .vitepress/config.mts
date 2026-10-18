import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

// Read precomputed sidebar
let sidebar = {}
try {
  const sidebarData = fs.readFileSync(path.resolve(__dirname, 'sidebar.json'), 'utf-8')
  sidebar = JSON.parse(sidebarData)
} catch (e) {
  sidebar = {}
}

export default defineConfig({
  title: 'PySpark Interview Prep',
  description: 'Enterprise-grade PySpark interview preparation wiki and certification learning hub',
  base: '/PySpark-Interview-Prep/',
  
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap' }],
    ['meta', { name: 'theme-color', content: '#0D0E12' }],
    ['meta', { name: 'author', content: 'Balasubramanian PG' }],
    ['meta', { property: 'og:title', content: 'PySpark Interview Prep Wiki' }],
    ['meta', { property: 'og:description', content: '260+ Curated PySpark Interview Questions, Architecture Diagrams, and Interactive Study Engine' }]
  ],

  themeConfig: {
    siteTitle: '⚡ PySpark Prep',
    logo: {
      light: '/spark-logo.svg',
      dark: '/spark-logo.svg',
      alt: 'PySpark Prep'
    },
    nav: [
      { text: 'Dashboard', link: '/' },
      { text: '1. Fundamentals', link: '/1. Fundamentals/1.1 Spark Architecture Basics/Readme' },
      { text: '2. Intermediate', link: '/2. Intermediate/2.1 Joins And Join Types/Readme' },
      { text: '3. Advanced', link: '/3. Advanced/3.1 Partitioning And Bucketing/Readme' },
      { text: '4. Senior Dev', link: '/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme' }
    ],
    sidebar: sidebar,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Balasubramanian-pg/PySpark-Interview-Prep' },
      { icon: 'linkedin', link: 'https://linkedin.com/in/balasubramanian-pg' }
    ],
    footer: {
      message: 'Zero-backend, client-first interactive learning portal for PySpark engineers.',
      copyright: 'Maintained by Balasubramanian PG'
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
