import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
})

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : ''
}

request.interceptors.request.use(
  (config) => {
    const method = (config.method || 'get').toLowerCase()
    if (['post', 'put', 'delete', 'patch'].includes(method)) {
      const csrf = getCookie('sso_csrf')
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

request.interceptors.response.use(
  (response) => {
    const body = response.data
    // 后端统一信封 {code,message,data}，注册等接口会以 201 返回
    if (body.code >= 200 && body.code < 300) {
      return body.data
    }
    throw new Error(body.message || '请求失败')
  },
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    const msg = error.response?.data?.message || '网络错误，请稍后重试'
    return Promise.reject(new Error(msg))
  }
)

export default request
