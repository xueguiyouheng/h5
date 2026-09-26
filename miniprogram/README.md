# 小程序端工程（独立工程 / 独立部署）

微信 + 支付宝小程序，Taro 4 + React 一套出双端。**与 `frontend/`（H5）互不引用**：没有 workspace、没有跨目录 import、没有共享 npm 包，
两端唯一的共同契约是 `/api/*` 的 JSON 与 `docs/api.md`，**不软链、不读 `frontend/` 的任何文件**（公共代码一律「移植一份」，见 `docs/miniprogram-plan.md` §10 决策 8）。
目录里那个 `go.mod` 与 Go 无关，只是把本子树挡出后端 `go build ./...` 的匹配范围（npm 依赖里夹带了 Go 源码）。

## 目录

```
config/        构建配置：dev/preview 打 localhost:8080，prod 只认 FM_API_BASE（缺了就在构建期停下）
project.config.json  微信开发者工具工程描述（miniprogramRoot 指向 dist/weapp）
src/
  theme/tokens.scss  设计 token，色值/字号/间距的唯一来源（数值 = H5 的 2 倍，写成 px 编译成 rpx）
  utils/request.js   传输层：Bearer + X-Client、信封拆解、401 重登重放、素材地址补全、静默登录
  utils/auth.js      账号密码登录、手机号授权登录与 openid 绑定（合并主键只认平台授权，手填号码不作数）；退出要记一笔，否则登录页的静默登录会立刻把人送回去
  utils/validate.js  表单校验：从 H5 的 profileStore/Register 移植一份，文案与后端口径一致
  utils/shop.js      当前门店缓存与落店：登录那一次按定位取最近营业店，之后只有门店页切店/跨店加购会改
  hooks/useRequest.js  取数封装：竞态丢弃 + loading/error/data + refresh，不引 react-query
  api/index.js       从 frontend/src/api 移植一份，只有素材补全、上传与注册三处因端能力而不同
  payment/           支付模块（一端一份）：api.js 打 /api/payment/*，launch.js 按 kind 执行，
                     providers.js 按端裁剪渠道，usePaymentStatus.js 轮询收敛，components/PaymentSheet 收银台
  constants/         订单与支付状态的中文映射与「可否续付」判定
  components/        ProductCard（首页/类目/搜索/收藏共用）等
  pages/home         首页：/shop/home 一屏 + 猜你喜欢分页 + 当前门店条
  pages/login        冷启动入口（pages[0]）：先静默试一次登录，绑过的微信无感进首页；试不出身份才露表单——账号密码为主路径（手机号/邮箱/用户名通用，与网页端同一账号），平台授权降到次级入口；成功后按定位落到最近营业店
  pages/register     注册：字段与校验照 H5 一套，商家多填门店名称/地址并可带定位坐标；成功后回到登录页并带出邮箱
  pages/category     类目：子类目切换压暗不闪屏，加购直接可点
  pages/search       搜索：热搜词 + 关键词分页
  ——  报错口径（每屏一致）：某一屏的某块内容拉取失败时，屏上已有内容就留着继续用、不叠红条，
      只有这一块什么都没有时才出「加载失败 + 重新加载」；结算试算与支付结果是例外（金额不能凭空显示）
  pages/product      详情：图集/营养/同类推荐，加购与「立即购买」（后者只结算这一行）
  pages/cart         购物车：勾选与数量全在服务端算，端只展示
  pages/checkout     结算：地址 → 渠道 → 试算 → 下单 → 收银台
  pages/payment-result 支付结果：只认轮询，未出终态可手动刷新
  pages/orders       订单：进行中/已完单两个 tab
  pages/order-detail 订单详情：轨迹、金额、续付与取消
  pages/address      收货地址：增删改与默认；`?pick=1` 时是结算页的选择器
  pages/profile      我的：资料、门店、订单与收藏入口、退出登录
  pages/favorites    我的收藏：行式布局 + 收藏内搜索，一键加购成功后这批同时移出收藏
  pages/stores       附近门店：定位可拒（有兜底排序），切店后整端重进首页
app.config.js        15 屏顺序 + 五 tab 纯文字 tabBar + 定位权限与隐私声明（pages[0] 是登录页，未登录的人不会先看到带 tabBar 的空商城）
```

## 启动

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"   # Node 22
cd miniprogram
npm install

# 本地后端要先起来（默认打 :8080，与 frontend/vite 的代理一致；换端口就带 FM_API_BASE）
# 开发：watch 模式，改代码自动重编
npm run dev:weapp        # 支付宝端 npm run dev:alipay

# 一次性本地预览包（不 watch，编完就退出，适合开发者工具直接打开）
npm run preview:weapp    # 支付宝端 npm run preview:alipay

# 生产：必须给公网 HTTPS 域名，代码里不写死也不猜；缺 FM_API_BASE 会在构建期直接停下
FM_API_BASE=https://api.your-domain.com npm run build:weapp
npm run lint             # oxlint src
```

> `build:*` 是**正式包**专用（`NODE_ENV=production`）。不带 `FM_API_BASE` 跑它会以退出码 1 停下并打印上面三条命令 ——
> 以前它会打出一个接口地址为空的包，要到真机运行时才表现为「接口地址未配置」，太晚。
> 本地预览一律走 `dev:*` 或 `preview:*`；后端不在 8080 就 `FM_API_BASE=http://localhost:8081 npm run preview:weapp`。

用开发者工具打开 `miniprogram/` 目录（不是 `dist/`），工具会读 `project.config.json` 自己找到 `dist/weapp`。

## 本地开发的前提与已知限制

| 事项 | 说明 |
|---|---|
| 域名校验 | 开发者工具要勾「不校验合法域名」（`project.config.json` 里 `urlCheck:false` 已带上），否则打不到 `http://localhost:8080`；**真机预览**要换成这台机器的局域网地址（`FM_API_BASE=http://192.168.x.x:8080 npm run dev:weapp`）并在手机端打开调试模式，正式包才需要备案 HTTPS 域名 |
| appid | `project.config.json` 里是 `touristappid`（游客模式），能编译能预览，但**拿不到平台手机号授权码**。因为登录主路径是账号密码，游客模式下整条买家链路照样能跑完 |
| 手机号授权 | 只有次级入口「微信授权手机号登录」用到它，所以登录页在开发环境多了一块「模拟授权」：把大陆手机号直接当授权码交给 mock 渠道（生产构建里这段代码不存在）。要验真实授权链路，需换成有资质的小程序 appid |
| 未登录态 | 按 §10 决策：小程序**不开放匿名浏览**，所以**登录页就是 `pages[0]`**——未登录的人冷启动直接落在登录页，不会先看到带 tabBar 的空商城。会话中途令牌失效由传输层 `reLaunch` 到登录页（免跳名单：登录/注册/支付结果三屏，结果屏显示的是钱到没到账，弹走就回不来这笔结论）；首页/门店/购物车/订单/地址/我的六屏保留「先登录 → 去登录」闸门作兜底，按钮走同一个 `gotoLogin()`。后端鉴权范围不因小程序放宽 |
| 退出登录 | 除了清令牌还记一笔 `fm_signed_out`：不记这一笔，登录页冷启动那一次静默登录会把刚退出的人原样送回首页，退出等于没退出。手动登录成功即清掉该标记 |
| 首次落店 | 登录成功那一次取一次定位，从附近门店里挑**最近的营业中门店**并切过去（`alignStoreByLocation`）；拿不到定位就不动，留在服务端回落的那家店。此后不再自动改店——切店是门店页的显式动作，只有跨店加购时 `ensureStore` 会顺手对齐到商品所属门店 |
| 平台 API 不回调 | 游客 appid 或隐私协议未通过时，`wx.login` / `wx.getLocation` 可能**既不 success 也不 fail**。所有等它们的地方都限时（`utils/shop.withDeadline`：定位 3s、落店 4s、bind 4s 且不 await、冷启动静默登录 3s），超时按失败处理——否则令牌已经拿到也进不了首页，表现为「点了登录一直转」 |
| 每次冷启动 409 | mock 按 `code` 派生 openid，而真机 `wx.login` 每次给的 code 不同 → 同一手机号会被判成「已绑定其他微信」。模拟授权走的固定 dev code 就是为规避这一点；密码登录后立刻 `POST /api/miniprogram/bind` 绑身份，绑失败不挡本次登录（下次冷启动仍可走密码登录） |
| 支付 | **链路已接通，渠道还是模拟的**：结算 → `prepay` → `launch`（小程序拿到 `qrcode` 挂起语义）→ 收银台投回执 → 轮询 `query` 收敛 → 结果页。**任何端都不自己判定成功**，页面只认 `GET /api/payment/query/{id}`。真实渠道要等 §7 资质与 `WX_MP_APP_ID`/商户密钥注入（P2g），届时只换环境变量与 `PAY_PROVIDER`，流程代码不动。支付宝小程序的 `tradeno` 形态属 P2f |
| 渠道与端必须匹配 | 微信小程序只挂「微信支付」、支付宝小程序只挂「支付宝」；后端 `prepay`/`launch` 两处也会拒跨端渠道（422），前端裁剪不当作可信边界 |
| 构建告警 | `dev:*`/`preview:*`（`NODE_ENV=development`）会打一条内容为 `== '"production"'` 的 webpack 告警，双端都有，来自 Taro 4.2.1 的 dev 模式（`@tarojs/*` 与业务代码里都没有这段文本）；产物已核对（接口地址正确、空地址的兜底分支被摇掉），`build:*` 无此告警 |

## 与 H5 的差异（移植时踩到的三处）

1. **凭证载体**：H5 用 HttpOnly Cookie + `X-CSRF-Token`，小程序用 `Authorization: Bearer`，后端 CSRF 中间件对 bearer 载体放行。
2. **素材地址**：后端只存 `/uploads/xxx` 相对路径，H5 靠同源解析，小程序无同源概念 → `absAsset()` 补全成绝对地址。对象存储/CDN 是小程序上线的硬前置（`docs/miniprogram-plan.md` §7）。
3. **上传**：小程序没有 `FormData`，`uploadImage(filePath)` 走 `Taro.uploadFile`，入参从 File 变成临时路径。

同一处业务缺陷现在要在各端各改一次，改 H5 时记得对照这里。本轮 H5 修的两条在小程序侧的状态：
**「加购后移出收藏」已随 `pages/favorites` 落地**（加购成功才移出，移出失败只提示不误报）；
**「支付结果弹窗返回重弹」在小程序不成立** —— 结果页是 `redirectTo` 落地的独立页（收银台那一级已从栈里去掉），面板可关，
没有 H5 那种「跳到订单页再按浏览器返回 → 结果页重挂 → 弹窗重弹」的路径。
