// 设计稿宽 750：源码里写 1px 编译成 1rpx，所以 token 的数值一律取「H5 的 2 倍」
// （H5 按 375 逻辑像素布局，两端同一套设计语言只差这个倍数）
// 工程内一律用相对路径 import，不设别名，移植过来的文件不用改依赖写法
const config = {
  projectName: 'freshmart-miniprogram',
  date: '2026-9-23',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.6 / 2,
  },
  sourceRoot: 'src',
  // 双端产物分目录，互不覆盖，也便于各自独立上传发布
  outputRoot: `dist/${process.env.TARO_ENV || 'weapp'}`,
  plugins: [],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false },
  },
  cache: { enable: false },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
}

module.exports = function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  // 缺 FM_API_BASE 时在这里停下：返回空串会打出一个「接口地址未配置」的包，
  // 要到真机运行时才发现；抛错则被 Taro 的加载兜底吞掉（表现为「找不到项目配置文件」）
  if (!process.env.FM_API_BASE) {
    console.error(
      '\n\x1b[31m[FM] 生产构建缺少 FM_API_BASE（正式接口域名，须 https 且已在平台后台配进 request 合法域名）\x1b[0m\n' +
        '  正式发布：FM_API_BASE=https://api.your-domain.com npm run build:weapp\n' +
        '  本地预览（打后端 localhost:8080）：npm run preview:weapp 或 npm run dev:weapp\n',
    )
    process.exit(1)
  }
  return merge({}, config, require('./prod'))
}
