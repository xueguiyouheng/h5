import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export const HOME_PATH = '/shop'

// parent 是业务上级页面：给了就固定回它，replace 让再按一次回退不会踩回本页；
// 不给才沿用浏览器历史（详情页这类「从哪来回哪去」的页面），历史为空时兜底回首页
export function useGoBack(parent) {
  const navigate = useNavigate()
  return useCallback(() => {
    if (parent) {
      navigate(parent, { replace: true })
      return
    }
    const index = window.history.state?.idx
    if (typeof index === 'number' && index > 0) {
      navigate(-1)
      return
    }
    navigate(HOME_PATH, { replace: true })
  }, [navigate, parent])
}
