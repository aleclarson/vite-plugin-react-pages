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
    const staticData = JSON.stringify(pagesData[pageId].staticData)
    const dataPath =
      '/@react-pages/pages' + pageId + (pageId == '/' ? '__index' : '')
    const dataProperty = isBuild
      ? `data: () => import("${dataPath}")`
      : `dataPath: "${dataPath}"`

    lines.push(
      `  "${pageId}": {`,
      `    staticData: ${staticData},`,
      `    ${dataProperty},`,
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
