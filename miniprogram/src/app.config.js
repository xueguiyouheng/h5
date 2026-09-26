// 页面顺序即小程序的进入路径：pages[0] 是冷启动首页
// 登录页放在第一个：没身份就没有门店，商城每一屏都取不到数，所以未登录的人不该先看到带 tabBar 的屏
// （登录页自己会静默试一次登录，绑过的微信仍然无感进首页）
// 底部五个 tab 全部只用文字：图形资源要等设计交付，先不让缺图卡住编译
export default {
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/category/index',
    'pages/cart/index',
    'pages/orders/index',
    'pages/profile/index',
    'pages/register/index',
    'pages/product/index',
    'pages/search/index',
    'pages/checkout/index',
    'pages/payment-result/index',
    'pages/order-detail/index',
    'pages/address/index',
    'pages/stores/index',
    'pages/favorites/index',
  ],
  tabBar: {
    color: '#8b93a1',
    selectedColor: '#00b861',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/category/index', text: '分类' },
      { pagePath: 'pages/cart/index', text: '购物车' },
      { pagePath: 'pages/orders/index', text: '订单' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'FreshMart',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f4f5f7',
  },
  // 定位只用于门店排序；不声明就调不动，被拒是常态（页面里有兜底排序）
  permission: {
    'scope.userLocation': {
      desc: '用于按距离展示你附近的门店',
    },
  },
  requiredPrivateInfos: ['getLocation'],
}
