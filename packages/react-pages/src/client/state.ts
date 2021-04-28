import { useMemo } from 'react'
import { dequal } from 'dequal'
import { o, useBinding, useDerived } from 'wana'
import type { PageLoaded, PagesStaticData, Theme } from '../../types'

export let useTheme: () => Promise<Theme>
export let usePagePaths: () => string[]
export let usePageModule: (path: string) => Promise<PageModule> | undefined
export let useStaticData: UseStaticData
export let useSiteData: UseSiteData

interface PageModule {
  ['default']: PageLoaded
}

interface UseStaticData {
  (): PagesStaticData
  (path: string): Record<string, any>
  <T>(
    path: string,
    selector: (staticData: Record<string, any>) => T,
    deps?: any[]
  ): T
}

interface UseSiteData {
  (): Record<string, any>
  <T>(selector: (siteData: Record<string, any>) => T, deps?: any[]): T
}

import initialTheme from '/@react-pages/theme'
import initialPages from '/@react-pages/pages'
import initialSiteData from '/@react-pages/siteData'

const initialPagePaths = Object.keys(initialPages)

// This HMR code assumes that our Jotai atoms are always managed
// by the same Provider. It also mutates during render, which is
// generally discouraged, but in this case it's okay.
if (import.meta.hot) {
  const hotState = o({
    theme: initialTheme(),
    pages: initialPages,
    pagePaths: initialPagePaths.sort(),
    staticData: toStaticData(initialPages),
    siteData: initialSiteData,
  })

  import.meta.hot!.accept('/@react-pages/theme.js', (module) => {
    hotState.theme = module.default()
  })
  import.meta.hot!.accept('/@react-pages/pages.js', (module) => {
    setPages(module.default)
  })
  import.meta.hot!.accept('/@react-pages/siteData.js', (module) => {
    hotState.siteData = module.default
  })

  const setPages = (newPages: any) => {
    let newStaticData: Record<string, any> | undefined

    const oldPages = hotState.pages
    for (const path in newPages) {
      const page = oldPages[path]
      const newPage = newPages[path]

      // Avoid changing the identity of `page.staticData` unless
      // a change is detected. This prevents unnecessary renders
      // of components that depend on `useStaticData(path)` call.
      if (page && dequal(page.staticData, newPage.staticData)) {
        newPage.staticData = page.staticData
      } else {
        newStaticData ??= {}
        newStaticData[path] = newPage.staticData
      }
    }

    // Update `pages` every time, since no hook uses it directly.
    hotState.pages = newPages

    // Avoid re-rendering `useStaticData()` callers if no data changed.
    if (newStaticData)
      hotState.staticData = {
        ...hotState.staticData,
        ...newStaticData,
      }

    // Avoid re-rendering `usePagePaths()` callers if no paths were added/deleted.
    const newPagePaths = Object.keys(newPages).sort()
    if (!dequal(hotState.pagePaths, newPagePaths)) {
      hotState.pagePaths = newPagePaths
    }
  }

  useTheme = () => useBinding(hotState, 'theme')
  usePagePaths = () => useBinding(hotState, 'pagePaths')

  const useDataPath = (path: string) =>
    useDerived((): string | null => {
      const { pages } = hotState
      const page = pages[path] || pages['/404']
      return page?.dataPath || null
    }, [path])

  // This hook uses dynamic import with a variable, which is not supported
  // by Rollup, but that's okay since HMR is for development only.
  usePageModule = (pagePath) => {
    const dataPath = useBinding(useDataPath(pagePath))
    return useMemo(() => {
      return dataPath ? import(dataPath /* @vite-ignore */) : void 0
    }, [dataPath])
  }

  const emptyData: any = {}
  const getStaticData = (path: string) => {
    const { pages } = hotState
    const page = pages[path] || pages['/404']
    return page?.staticData || emptyData
  }

  useStaticData = (pagePath?: string, selector?: Function) =>
    useBinding(
      useDerived(() => {
        const staticData = pagePath
          ? getStaticData(pagePath)
          : hotState.staticData

        return selector ? selector(staticData) : staticData
      }, [pagePath])
    )

  useSiteData = (selector?: Function) =>
    useBinding(
      useDerived(() => {
        const { siteData } = hotState
        return selector ? selector(siteData) : siteData
      })
    )
}

// Static mode
else {
  useTheme = () => useMemo(initialTheme, [])
  usePagePaths = () => initialPagePaths
  usePageModule = (path) => {
    const page = initialPages[path] || initialPages['/404']
    return useMemo(() => page?.data(), [page])
  }
  useStaticData = (path?: string, selector?: Function, deps?: any[]) => {
    if (path) {
      const page = initialPages[path] || initialPages['/404']
      const staticData = page?.staticData || {}
      return selector
        ? useMemo(() => selector(staticData), deps || [])
        : staticData
    }
    return toStaticData(initialPages)
  }
  useSiteData = (selector?: Function, deps?: any[]) => {
    return selector
      ? useMemo(() => selector(initialSiteData), deps || [])
      : initialSiteData
  }
}

function toStaticData(pages: Record<string, any>) {
  const staticData: Record<string, any> = {}
  for (const path in pages) {
    staticData[path] = pages[path].staticData
  }
  return staticData
}
