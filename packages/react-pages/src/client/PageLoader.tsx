import React, { useContext, useEffect, useState } from 'react'
import { Theme } from '../../types'
import { dataCacheCtx } from './ssr/ctx'
import { useTheme } from './state'
import usePageLoader from './usePageLoader'

interface Props {
  routePath: string
}

const PageLoader = React.memo(({ routePath }: Props) => {
  const [Theme, setTheme] = useState((): Theme => () => null)
  const themePromise = useTheme()
  useEffect(() => {
    themePromise.then((Theme) => {
      setTheme(() => Theme)
    })
  }, [themePromise])

  const loadState = usePageLoader(routePath)
  const dataCache = useContext(dataCacheCtx)
  return <Theme loadState={loadState} loadedData={dataCache} />
})

export default PageLoader
