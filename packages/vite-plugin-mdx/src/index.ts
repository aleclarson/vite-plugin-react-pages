import type { Plugin } from 'vite'
import type { Options } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import { stopService, transformMdx } from './transform'

export function cleanCreatePlugin(mdxOpts?: Options): Plugin {
  let shouldApplyHMR = true

  return {
    name: 'vite-plugin-mdx',
    configResolved(config) {
      if (config.command === 'build' || config.isProduction) {
        shouldApplyHMR = false
      }
    },
    transform(code: string, id: string) {
      if (!/\.mdx?$/.test(id)) {
        return
      }

      return transformMdx({ code, mdxOpts, forHMR: shouldApplyHMR, id })
    },
    async closeBundle() {
      await stopService()
    },
  }
}

export default function createPlugin(_mdxOpts?: any) {
  let remarkPlugins: any[] = _mdxOpts?.remarkPlugins ?? []
  // support frontmatter by default
  remarkPlugins = [remarkFrontmatter, ...remarkPlugins]
  return cleanCreatePlugin({ ..._mdxOpts, remarkPlugins })
}

export { transformMdx }
