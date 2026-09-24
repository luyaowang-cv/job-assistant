// https://v3.nuxtjs.org/docs/directory-structure/nuxt.config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@element-plus/nuxt',
    '@nuxtjs/color-mode'
  ],

  devtools: {
    enabled: true,
  },

  app: {
    // head
    head: {
      title: 'Element Plus + Nuxt 3',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'ElementPlus + Nuxt3',
        },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    }
  },

  // css
  css: [
    '@unocss/reset/tailwind.css',
    '~/assets/scss/index.scss'
  ],

  // vueuse
  vueuse: {
    ssrHandlers: true,
  },

  // colorMode
  colorMode: {
    classSuffix: '',
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    // 按 CPU 核心数起多个 worker 进程。Node 执行 JS 只用一条线程，默认的
    // node-server 预设只跑一个进程，2 核机器实际只用 1 核——页面渲染是计算
    // 密集型（SSR），多个用户同时打开页面时会排队。node-cluster 把闲置的核
    // 用起来，并发渲染数随核数线性提升。
    // worker 数量默认取 os.cpus().length，可用 NITRO_CLUSTER_WORKERS 覆盖。
    // 注意：每个 worker 是独立进程，Nitro 插件会在每个 worker 里各执行一次，
    // 涉及定时任务/单例初始化时需要在插件里自己做去重（见 plugins/feishu-auto-sync.ts）。
    preset: 'node-cluster',
    experimental: {
      // 让 useEvent() 基于 AsyncLocalStorage，保证并发请求下"当前用户"不串。
      asyncContext: true,
    },
    externals: {
      external: ['playwright-core', 'xlsx'],
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      ignore: ['/hi'],
    },
  },

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/assets/scss/element/index.scss" as element;`,
        },
      },
    },
  },

  elementPlus: {
    icon: 'ElIcon',
    importStyle: 'scss',
    themes: ['dark'],
  },
})
