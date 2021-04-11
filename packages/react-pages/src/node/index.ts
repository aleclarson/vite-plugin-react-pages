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
import { resolveTheme } from './dynamic-modules/resolveTheme'

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
): Plugin {
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

  return {
    name: 'vite-plugin-react-pages',
    config: () => ({
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
      return id.startsWith(modulePrefix) ? id : undefined
    },
    async load(id) {
      // page list
      if (id === pagesModuleId) {
        return renderPageList(await pageStrategy.getPages(), isBuild)
      }
      // one page data
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
      // site data
      if (id === siteDataModuleId) {
        siteData ??= Promise.resolve(loadSiteData ? loadSiteData() : {})
        return `export default ${JSON.stringify(await siteData)}`
      }
      if (id === themeModuleId) {
        return `export { default } from "${await resolveTheme(pagesDir)}";`
      }
      if (id === ssrDataModuleId) {
        return renderPageListInSSR(await pageStrategy.getPages())
      }
    },
    // @ts-expect-error
    vitePagesStaticSiteGeneration: staticSiteGeneration,
    closeWatcher() {
      pageStrategy.close()
    },
  }
}

export type {
  Theme,
  LoadState,
  PagesLoaded,
  PagesStaticData,
} from '../../client'
