import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 取数薄封装：react-query 不在小程序端引入（决策 6），这里只保证三件事
 * 1) 竞态：后发先至的旧响应一律丢弃，页面不会闪回旧数据
 * 2) 状态：loading / error / data 三段，错误带原 Error 供页面判类型（如未授权手机号）
 * 3) 重取：refresh() 给下拉刷新与操作后回刷用，不自动轮询
 * fetcher 走 ref，调用方可以直接闭包当前 state，不必传依赖数组
 */
export default function useRequest(fetcher, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, loading: !skip, error: null })
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const seq = useRef(0)

  const run = useCallback(async () => {
    seq.current += 1
    const callId = seq.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await fetcherRef.current()
      if (seq.current !== callId) return null
      setState({ data, loading: false, error: null })
      return data
    } catch (err) {
      if (seq.current !== callId) return null
      setState((prev) => ({ ...prev, loading: false, error: err }))
      return null
    }
  }, [])

  useEffect(() => {
    if (!skip) run()
  }, [skip, run])

  return { ...state, refresh: run }
}
