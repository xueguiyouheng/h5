import './app.scss'

// 冷启动落在登录页（pages[0]），静默登录由那一屏自己发起：
// 放在这里等于在启动阶段调路由 API，微信会拒，结果是未登录的人停在带 tabBar 的空屏上
const App = ({ children }) => children

export default App
