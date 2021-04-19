import * as path from 'path'
import type { Plugin } from 'vite'
import type { MdxPlugin } from 'vite-plugin-mdx'
import {
  renderPageList,
  renderPageListInSSR,
  renderOnePageData,
} from './dynamic-modules/pages'
import {
  FindPages,
  LoadPageData,
  PageStrategy,
} from './dynamic-modules/PageStrategy'
import { rehypePages } from './rehypePages'

const modulePrefix = '/@react-pages/'
const pagesModuleId = modulePrefix + 'pages'
const themeModuleId = modulePrefix + 'theme'
const siteDataModuleId = modulePrefix + 'siteData'
const ssrDataModuleId = modulePrefix + 'ssrData'

export default function pluginFactory(
  opts: {
    pagesDir?: string
    findPages?: FindPages
    loadPageData?: LoadPageData
    loadSiteData?: () => object | Promise<object>
    useHashRouter?: boolean
    staticSiteGeneration?: {}
  } = {}
) {
  const {
    findPages,
    loadPageData,
    loadSiteData,
    useHashRouter = false,
    staticSiteGeneration,
  } = opts

  let isBuild: boolean
  let pagesDir: string
  let pageStrategy: PageStrategy
  let siteData: Promise<object> | undefined
  let themeModulePath: string

  const loader: Plugin = {
    name: 'react-pages:loader',
    config: () => ({
      optimizeDeps: {
        exclude: ['vite-plugin-react-pages/client'],
      },
      resolve: {
        alias: {
          '/@pages-infra': path.join(__dirname, '../client/'),
        },
      },
      define: {
        __HASH_ROUTER__: !!useHashRouter,
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: undefined,
          },
        },
      },
    }),
    configResolved({ root, plugins, logger, command }) {
      isBuild = command === 'build'
      pagesDir = opts.pagesDir ?? path.resolve(root, 'pages')
      pageStrategy = new PageStrategy(pagesDir, findPages, loadPageData)
      themeModulePath = path.join(root, 'theme.config.tsx')

      // Inject parsing logic for frontmatter if missing.
      const { devDependencies = {} } = require(path.join(root, 'package.json'))
      if (!devDependencies['remark-frontmatter']) {
        const mdxPlugin = plugins.find(
          (plugin) => plugin.name === 'vite-plugin-mdx'
        ) as MdxPlugin | undefined

        if (mdxPlugin?.mdxOptions) {
          mdxPlugin.mdxOptions.remarkPlugins.unshift(
            require('remark-frontmatter')
          )
        } else {
          logger.warn(
            '[react-pages] Please install vite-plugin-mdx@3.1 or higher'
          )
        }
      }
    },
    configureServer({ watcher, moduleGraph }) {
      const reloadVirtualModule = (moduleId: string) => {
        const module = moduleGraph.getModuleById(moduleId)
        if (module) {
          moduleGraph.invalidateModule(module)
          watcher.emit('change', moduleId)
        }
      }

      pageStrategy
        .on('promise', () => reloadVirtualModule(pagesModuleId))
        .on('change', (pageId: string) =>
          reloadVirtualModule(pagesModuleId + pageId)
        )
    },
    resolveId(id) {
      if (id.startsWith(modulePrefix))
        return id.endsWith('.js') ? id : id + '.js'
    },
    async load(id) {
      if (id.startsWith(modulePrefix)) {
        // Strip the ".js" suffix
        id = id.slice(0, -3)

        // Render the page manifest.
        if (id === pagesModuleId) {
          return renderPageList(await pageStrategy.getPages(), isBuild)
        }

        // Render a page module.
        if (id.startsWith(pagesModuleId + '/')) {
          let pageId = id.slice(pagesModuleId.length)
          if (pageId === '/__index') pageId = '/'
          const pages = await pageStrategy.getPages()
          const page = pages[pageId]
          if (!page) {
            throw Error(`Page not found: ${pageId}`)
          }
          return renderOnePageData(page.data)
        }

        // Render the site-wide data.
        if (id === siteDataModuleId) {
          siteData ??= Promise.resolve(loadSiteData ? loadSiteData() : {})
          return `export default ${JSON.stringify(await siteData)}`
        }

        // Render the theme module.
        if (id === themeModuleId) {
          return `export default () => import("/@fs${themeModulePath}").then(module => module.default)`
        }

        if (id === ssrDataModuleId) {
          return renderPageListInSSR(await pageStrategy.getPages())
        }
      }
    },
    // @ts-expect-error
    vitePagesStaticSiteGeneration: staticSiteGeneration,
    closeWatcher() {
      pageStrategy.close()
    },
  }

  const emitter: Plugin = {
    name: 'react-pages:emitter',
    enforce: 'post',
    configResolved({ root, base }) {
      this.generateBundle = async function (_, bundle) {
        const chunks = Object.values(bundle).filter(
          (asset) => asset.type == 'chunk'
        ) as import('rollup').OutputChunk[]

        const [entry] = Array.from(this.getModuleIds())
        const entryId = path.relative(root, entry)
        const entryHtml = bundle[entryId] as import('rollup').OutputAsset
        const entryJs = chunks.find((chunk) => chunk.facadeModuleId == entry)!

        const rehype = require('rehype') as typeof import('rehype')
        const compiler = rehype().use(rehypePages, base, entryJs.fileName)

        const pages = await pageStrategy.getPages()
        pageStrategy.close()

        for (const pageId in pages) {
          if (pageId == '/') {
            continue
          }

          const pageModuleId = pagesModuleId + pageId
          const pageModule = chunks.find(
            (chunk) => chunk.facadeModuleId == pageModuleId
          )!

          const fileName =
            pageId.slice(1) + (pageId == '/404' ? '.html' : '/index.html')
          const compiled = await compiler.process({
            contents: entryHtml.source,
            data: { pageId, pageModule },
          })

          this.emitFile({
            type: 'asset',
            fileName,
            source: compiled.contents + '',
          })
        }
      }
    },
  }

  return [loader, emitter]
}

export type {
  Theme,
  LoadState,
  PagesLoaded,
  PagesStaticData,
} from '../../types'
