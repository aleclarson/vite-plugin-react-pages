export function rehypePages(
  base: string,
  mainModuleId: string
): import('unified').Transformer {
  const { selectAll } = loadHastSelect()
  return (ast, file) => {
    const data = file.data as {
      pageId: string
      pageModule: import('rollup').OutputChunk
    }
    for (const script of selectAll('script', ast)) {
      const props = script.properties
      if (props && props.src == base + mainModuleId) {
        props.src = base + data.pageModule.fileName
      }
    }
  }
}

function loadHastSelect() {
  return require('hast-util-select') as {
    select: (
      selector: string,
      tree: import('unist').Node
    ) => import('hast').Element | undefined
    selectAll: (
      selector: string,
      tree: import('unist').Node
    ) => import('hast').Element[]
  }
}
