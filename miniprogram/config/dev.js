module.exports = {
  env: {
    NODE_ENV: '"development"',
  },
  defineConstants: {
    // 本地后端地址：开发者工具须勾「不校验合法域名」才打得开 localhost，真机要换成备案域名
    __API_BASE__: JSON.stringify(process.env.FM_API_BASE || 'http://localhost:8080'),
  },
  mini: {},
}
