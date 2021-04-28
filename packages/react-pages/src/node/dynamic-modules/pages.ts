import slash from 'slash'

export interface PagesData {
  [pageId: string]: {
    data: {
      [key: string]: string
    }
    staticData: {
      [key: string]: any
    }
  }
}

export async function renderPageList(pagesData: PagesData, isBuild: boolean) {
  const lines: string[] = ['export default {']
  for (const pageId in pagesData) {
    const pageUri = pageId.slice(1) + (pageId == '/' ? '__index' : '')
    const dataPath = `/@react-pages/pages/${pageUri}.js`
    const props: string[] = [
      `staticData: ${JSON.stringify(pagesData[pageId].staticData)}`,
      `data: () => import("${dataPath}")`,
    ]
    // To avoid reloading the active page when another page is changed,
    // we want to reload only if the `dataPath` of the active page has
    // changed. If not, let Fast Refresh work its magic.
    if (!isBuild) {
      props.push(`dataPath: "${dataPath}"`)
    }
    lines.push(
      `  "${pageId}": {`,
      ...props.map((prop) => `    ${prop},`),
      `  },`
    )
  }
  lines.push('}')
  return lines.join('\n')
}

export async function renderPageListInSSR(pagesData: PagesData) {
  const addPagesData = Object.entries(pagesData).map(
    ([pageId, { staticData }], index) => {
      let subPath = pageId
      if (subPath === '/') {
        // import("/@react-pages/pages/") would make vite confused
        // so we change the sub path
        subPath = '/__index'
      }
      const code = `
pages["${pageId}"] = {};
import page${index} from "/@react-pages/pages${subPath}";
pages["${pageId}"] = page${index};`
      return code
    }
  )
  return `
const pages = {};
${addPagesData.join('\n')}
export default pages;
`
}

export function renderOnePageData(onePageData: { [dataKey: string]: string }) {
  const importModule = Object.entries(onePageData).map(
    ([dataKey, path], idx) => `
import * as m${idx} from "${slash(path)}";
modules["${dataKey}"] = m${idx};`
  )
  return `
  const modules = {};
  ${importModule.join('\n')}
  export default modules;`
}
