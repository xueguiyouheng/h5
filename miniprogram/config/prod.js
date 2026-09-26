module.exports = {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    // 正式接口域名只能由构建环境变量给（FM_API_BASE），代码里不写死也不猜
    // 缺失的拦截在 config/index.js（那里抛错会被 Taro 的加载兜底吞掉）
    __API_BASE__: JSON.stringify(process.env.FM_API_BASE),
  },
  mini: {},
}
