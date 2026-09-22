# 微信 / 支付宝小程序落地方案

> 状态：**已拍板，开工中**（2026-09-22 用户确认 §10 全部决策点，工作分支 `feat/miniprogram-p2`）。本文是 P2 的唯一实施依据；每阶段完成时在 §8 表格补「已完成」标记。
> 总原则（用户原话）：**所有问题以稳定安全为核心，不被技术限制** —— 因此 react-query 与 Tailwind 这两处「复用有风险」的资产直接判定为不复用，小程序侧手写。
> 上游文档：功能范围与业务规则以 [`product-prototype.md`](./product-prototype.md) 为准（其 §12 是本文的雏形），支付契约以 [`payment-integration.md`](./payment-integration.md) 为准，接口清单以 [`api.md`](./api.md) 为准。
> 本文中的所有代码位置都是 2026-09-22 读源码核实过的，改动落地后请同步更新行号。

---

## 1. 结论与范围

**结论**

1. **一套代码出双端**：Taro 4 + React，`weapp` 与 `alipay` 两个编译目标；微信先行，支付宝作为同工程的第二个 target 增量补齐。
2. **后端只动两类东西**：① 端适配层（CSRF 按凭证载体分流、小程序身份 openid/buyer_id 落库并由服务端解析、`Launch` 唤起契约加一种形态）；② 账号侧一处真实业务变更——手机号成为可登录凭据、校验换成中国大陆号段（§6.1，H5 同受影响的既定需求）。除此之外，72 个 `/api/*` 接口、金额计算、库存扣减、订单状态机、门店作用域一律不动。
3. **不做 web-view 套壳**。理由：小程序 web-view 内**调不起支付**（微信要求小程序内支付必须走 `wx.requestPayment`，支付宝 web-view 内禁调收银台），而 web-view 又要求企业主体 + 业务域名备案。花一遍备案的代价换一个「能审核通过但收不了钱」的壳，不划算。

**P2 范围（要做的）**

- 买家核心闭环 11 屏（§4 的清单）。
- **商家发品**（中台子集，§1 非目标里已划界）。
- 微信 / 支付宝静默登录与账号合并，合并主键＝平台授权手机号。
- **手机号成为登录凭据**（H5 同步支持）+ 校验规则换成中国大陆号段（§6.1）。
- 小程序内支付：微信 JSAPI、支付宝 `trade.create` + `my.tradePay`；资质到位前用 mock 走通同一套骨架。
- 小程序工程骨架、双端编译配置、域名与授权合规配置。

**P2 非目标（明确不做）**

- **运营中台只移植「发品」，其余 9 路由留 H5/桌面**（2026-09-22 拍板：用户明确「需要商家发品」）。移植范围＝商品列表 + 新增/编辑（名称/价格/库存/类目/主图上传）+ 上下架，直连既有 `/api/admin/*` 与门店作用域。其余仍不做：轮播、类目管理、订单处理、门店资料、媒体库、概览等——它们大量使用 `window.confirm`（`AdminCarousel.jsx:151`、`AdminProducts.jsx:99`、`AdminCategories.jsx:239`、`AdminMedia.jsx:67`）、`navigator.clipboard`（`AdminMedia.jsx:52`）、`keydown` 监听（`adminUi.jsx:206`），且这些操作的真实场景就是电脑前。发品屏的样式与交互另计 4–5 人日（已排进 §8）。
- App（P3）、退款与对账（H3）、多语言 i18n、商品评价 —— 均不在本文范围。
- 第二批买家页面（收藏 / 券 / 地址 / 客服 / 帮助 / 设置 / 引导页）先不移植，见 §4 结尾。

---

## 2. 复用清单

> 硬约束：动手前先确认复用面。下表右列是判定依据，不是推测。

### 2.1 直接复用，一行不改

| 资产 | 依据 |
|------|------|
| 全部 `/api/*` 接口与 `models/*.go` 出参 JSON | 后端不感知端；`payment/launch.go:26` 的 `LaunchEnv` 当初就是为换端留的口子 |
| `payment/` 后端模块 | `Provider` 五方法接口（`payment/provider.go:44-51`）、`settle()` 幂等 + 双向金额复核、超时惰性关单 —— 与端无关 |
| `GET /api/payment/query/{id}` 轮询 | 三端共用的唯一收款确认路径，**必须保持单一，不许各端另起判断** |
| `frontend/src/api/index.js`、`api/admin.js`、`payment/api.js` | 三者都只经 `utils/request.js` 这一个出口发请求（`api/index.js:3`、`api/admin.js:1`、`payment/api.js:3`）→ 换实现只换一个文件 |
| `frontend/src/stores/*.js` 10 个 zustand store | 已核实**零 `persist()` 中间件**，不读写 localStorage，运行时无关。**只复用「客户端状态」那一类**（当前门店、选中的购物车行、收银台开关等）；任何承担取数职责的 store 在 MP 侧配本地 `useRequest` 用，不与 react-query 混用 |
| `constants/orderStatus.js`、`constants/adminOrder.js` | 纯数据映射。⚠️ `adminOrder.js` 与后端状态机双写，改状态机时两处同步（`product-prototype.md` §5 已记） |
| 设计稿几何 | 375 屏 → 750rpx，现有 `pl-[43px]` / `h-[47px]` 一律 **px×2=rpx** 机械换算 |
| 配色体系 | `#00b861` 主按钮绿 / `#f9f8f6` 卡底 / `#f4f5f7` 分隔线 / `#8b8b8b`·`#b6bbb9` 次要文字 / `#f50000` 错误 / 支付宝 `#1677ff` / 微信 `#07c160`（`payment/providers.js`） |
| `utils/locate.js`、`hooks/useGoBack.js` 的**契约** | 各自只封了一个浏览器 API（`locate.js:3` `navigator.geolocation`、`useGoBack.js:15` `window.history.state.idx`），失败返回 `null` 的兜底语义保持不变即可对接同一套 `/api/shop/stores/nearby` |
| 后端返回的图片字段 | `image_url` / `hero_image_url` / `media_url` / `avatar_url` 全是完整字符串，商品图无需改造（**但必须是公网 HTTPS**，见 §7） |

### 2.2 必须重写（不能糊）

| 项 | 原因 |
|---|---|
| 21 个页面的 JSX 标签 | `div/img/span/onClick` → `View/Image/Text/onTap`，逻辑可照抄、标签全换 |
| Tailwind 类名 | 74 个色值以 arbitrary class 形式硬编码、共 503 处，小程序没有这套运行时 → **2026-09-22 拍板：不转换、不复用，小程序侧样式全部手写**，色值与间距抽进 `miniprogram/src/theme/tokens`（§10 决策 3） |
| react-query 数据层 | **2026-09-22 拍板：小程序不用**。Taro 的 React 与 react-query v5 的组合没有生产先例可依赖，「安全稳定」优先于少写几十行 → MP 侧直接调 `api/*`（这层仍复用），配一个本地 `useRequest` 薄封装承担 loading/error/手动刷新。代价：H5 的 `hooks/use*.js` 11 个数据 hook 不迁移，逐屏重写取数逻辑 |
| 无限滚动 | `hooks/useShopData.js:23` 用 `IntersectionObserver` → `onReachBottom` |
| 滚动位置记忆 | `components/ScrollMemory.jsx:18-29` 用 `window.scrollY/scrollTo/scroll 事件` → `pageScrollTo` + `onPageScroll` |
| 飞入购物车动画 | `hooks/useAddToCart.js:9-56` 用 `querySelectorAll/getBoundingClientRect/createElement/body.appendChild/window.innerHeight` → `Taro.createSelectorQuery`，或直接降级成按钮态变化 |
| 弹层滚动锁 | `payment/components/PaymentSheet.jsx:47`、`components/ResultSheet.jsx:28`、`components/StoreSwitcher.jsx:63` 的 `document.body.style.overflow` → `catchTouchMove` |
| `payment/launch.js` | 四种 kind 全是浏览器动作：`form` 建隐藏表单提交、`redirect` 改 `window.location.href`、`jsapi` 调 `window.WeixinJSBridge`、`qrcode` 挂起轮询（`payment/launch.go:15-23` + `frontend/src/payment/launch.js:11-21`）→ 小程序版 executor 另写，**服务端 kind 不变**；注意 `launch.js:22-23` 的 `default` 分支会直接抛错，所以**服务端绝不能给 H5 回新 kind** |
| 65 个本地素材（28 PNG + 37 SVG） | 小程序 `<Image>` 不渲染 SVG；主包限 2MB → 图标转 PNG 或字体图标，照片类必须走网络 URL |
| mock 收银台 | 现在靠浏览器整页跳 `/api/payment/mock/launch` 再 302 回结果页（`payment/http.go:46` 注册的是 GET）；小程序没有「跳出去再跳回来」，见 §5.3 |
| `PrivateRoute` + 路由守卫 | `App.jsx` 的 react-router 树 → 小程序页面栈 + `app.config` 的 pages 顺序 |

---

## 3. 后端改造

### 3.1 P2a 端标识与凭证载体（1.5 人日）

**(1) CSRF 按载体分流 —— 换端的第一道墙**

现状（已实测）：只带 `Authorization: Bearer` 而不带 Cookie 的写请求会被 **403「CSRF 防护：缺少 CSRF Cookie」**。`middleware/csrf.go:35-44` 的豁免只有 4 条引导端点 + `/api/payment/notify/` 前缀；而 `middleware/jwt.go:76-88` 的 `extractToken` **已经支持 Bearer 回落**，`POST /api/login` 的响应体也已经回 `LoginResponse{Token, TokenType:"Bearer"}`（`controllers/auth_controller.go:58-61`）。所以缺的不是鉴权，是 CSRF。

改法（**不往白名单加路由**）：

- `middleware/jwt.go`：`extractToken` 命中 Cookie 时 `c.Set("authCarrier","cookie")`，命中 Bearer 时 `c.Set("authCarrier","bearer")`。
- `middleware/csrf.go`：写操作中 `authCarrier == "bearer"` → 直接 `c.Next()`。

安全性论证（写进注释）：double-submit cookie 存在的唯一理由是**浏览器会自动携带 Cookie**，攻击者无法读取但能迫使发出；`Authorization` 头不会被跨站自动携带，因此对 Bearer 请求这一防线无攻击面。Cookie 会话路径的校验逻辑一字不改。

**(2) 端标识显式化，不再靠 UA 嗅探**

- `payment/launch.go`：`LaunchEnv` 增 `Client string`，常量 `ClientH5` / `ClientMPWechat` / `ClientMPAlipay` / `ClientApp`。
- `payment/http.go:123-127`：从 `X-Client` 头读，缺省 `h5`。
- `payment/wechat.go:98-103` 的分流条件由 `IsWechatBrowser(env.UserAgent)` 改为 `env.Client == ClientMPWechat || IsWechatBrowser(env.UserAgent)`。原因：小程序请求的 UA 不可依赖，JSAPI 必须按端**强制**，否则可能被判成 H5 并回一个跳不出去的 `redirect`。`IsWechatBrowser` 保留给 H5 内部浏览器场景。

**(3) openid 不许由客户端自报**

- 现状：`payment/http.go:125` 是 `OpenID: ctx.Query("openid")` —— 信任客户端传入的付款人身份。H5 场景没有 openid 所以没暴露，小程序一接就是真问题。
- 改法：`payment/http.go` 的 `Module` 再注入一个解析函数，与既有 `MemberFunc`（`http.go:15-17`）同构，保持 payment 不 import 会员代码：
  ```go
  // PayerFunc 按会员 ID 取该端支付所需的付款人标识，由外层（控制器）注入
  type PayerFunc func(memberID string) (Payer, error)
  type Payer struct{ WxOpenID, AlipayUserID string }
  ```
  `launch` 里改成 `Payer: m.payer(memberID)` 后按 `provider` 选字段填 `LaunchEnv.OpenID`。
- 未采用方案：往 JWT claims 里塞 openid（`utils/jwt.go:18-24` 的 `Claims` 目前没有该字段）。优点每次请求少一次 Mongo 查询；代价是要动签名结构、且换绑/解绑后旧 token 仍带着过期 openid。**先按查库实现**，量大了再优化。

**验收**：带 Bearer 的登录 / 加购 / 下单 / 建支付单 / mock 回调全部 2xx；H5 三条主流程回归零差异（§9）。

### 3.2 P2b 小程序账号打通（2 人日）

**数据层**

- `models/account.go` 的 `Member` 新增三字段，全部 `json:"-"`（不外泄、不出现在任何出参）：
  ```go
  WxOpenID     string `bson:"wx_openid,omitempty" json:"-"`
  WxUnionID    string `bson:"wx_unionid,omitempty" json:"-"`
  AlipayUserID string `bson:"alipay_user_id,omitempty" json:"-"`
  ```
  与既有 `Password`、`ResetCode`、`Longitude/Latitude` 的 `json:"-"` 口径一致。
- `config/mongo.go` 的 `specs`（`:137-157`）加两条唯一索引。注意该函数已经在 `:161` 统一 `SetSparse(true)`，所以存量 4 个会员没有这三个字段也不会被判重复 —— 这是能安全加索引的前提。

**服务层**：新增 `services/mp_auth_service.go`

| 端点 | 入参 | 内部流程 |
|------|------|---------|
| `POST /api/miniprogram/wechat/login` | `{code, phone_code?}` | `code2session`（appid+secret 从环境变量）→ openid/unionid → 命中 `wx_openid` 则直接签发；未命中按 §6 合并策略 → `utils.GenerateMemberToken(memberID, username, ...)` |
| `POST /api/miniprogram/alipay/login` | `{auth_code}` | `alipay.system.oauth.token` → `buyer_id`(2088) → 同上 |
| `POST /api/miniprogram/bind` | `{target, verify}` | 已登录状态下把 openid/支付宝 uid 绑到当前会员（用户在小程序里手动密码登录一次即完成合并） |

- 出参结构与 `POST /api/login` 完全一致（`models.LoginResponse{token, token_type:"Bearer"}`），前端不新增分支。
- 小程序侧把 token 存 `Taro.setStorageSync`，后续每个请求带 `Authorization` + `X-Client`。
- 密钥口径沿用既定约束：**只从环境变量进，不落库、不写日志、不出现在响应**（同 `payment/settings.go` 顶部注释与 `product-prototype.md` §5「支付安全」）。新增：`WX_MP_APP_ID` / `WX_MP_APP_SECRET` / `ALIPAY_MP_APP_ID` / `ALIPAY_MP_PRIVATE_KEY` / `ALIPAY_MP_PUBLIC_KEY`。缺省值一律含 `MOCK` 字样。
- **登录也要能先 mock 跑通、后续直接替换**（与支付同一条既定原则）：`code2session` / `alipay.system.oauth.token` 的真实 HTTP 调用是唯一主路径，只有当对应 appid 缺失或以 `MOCK` 开头时才走确定性假解析（`code` → 稳定派生的 openid/buyer_id），**分支只放在「换取身份」这一步，合并与签发 token 的代码一行不差**。这样资质到位后换密钥不换流程，和 `PAY_PROVIDER=mock` 的处置方式一致。
- CSRF：这两个登录端点是 POST 且此刻客户端还没有任何会话，语义与 `/api/login` 相同 → 加入 `csrfExemptPaths`（`middleware/csrf.go:35-40`）并在注释写明理由；`/api/miniprogram/bind` 是已登录态的写操作，**不豁免**，靠 P2a 的 Bearer 分流通过。

**验收**：同一手机号在 H5 注册、在小程序登录 → 拿到同一个 `member_id`，`/api/auth/me` 返回的订单/收藏/地址与 H5 完全一致。

### 3.3 P2c 支付形态补齐（2 人日 + 资质等待）

**微信侧**

- `payment/settings.go` 的 `WechatParams` 增 `MiniAppID`（`WECHAT_MINI_APP_ID`）。**这是硬约束不是可选项**：V3 JSAPI 下单的 `appid` 必须与 `payer.openid` 同源（同一个小程序），而现有 `Channels.Wechat.AppID` 注释写明是「公众号/小程序/开放平台 appid，需与商户号关联」的单值 —— 小程序与公众号是两个 appid，`payment/wechat.go:200` 的 `wechatJSAPISign` 用错 appid 签出来的参数，`wx.requestPayment` 会直接拒。
- 因此 `launchJSAPI(ctx, payment, openID)` 需要多一个 appid 实参：`Client == ClientMPWechat` 用 `MiniAppID`，微信内置浏览器 H5 用现有 `AppID`。商户号、APIv3 Key、证书序列号三端共用。
- 下单路径 `/pay/transactions/jsapi`（`wechat.go:23`）与第二段签名逻辑均已实现，改动只在「按 client 选 appid」。

**支付宝侧**

- 小程序支付是**另一个产品**：`alipay.trade.create`（`buyer_id` 必填、`product_code=FACE_TO_FACE_PAYMENT`）拿 `trade_no`，前端 `my.tradePay({tradeNO})`。与 `payment/alipay.go:96-101` 的 `alipay.trade.wap.pay` 自提交表单完全不同，且需要小程序应用（非 H5 应用）的密钥。
- `payment/launch.go` 新增 kind：
  ```go
  LaunchTradeNo = "tradeno" // 支付宝小程序：前端 my.tradePay({tradeNO})
  ```
  `Launch` 结构加 `TradeNo string \`json:"trade_no,omitempty"\``。既有前端 `payment/launch.js` 不认这个 kind 也不会收到（只在 `X-Client: mp_alipay` 时才回），符合「前端按 kind 分支执行、不拼任何渠道参数」的既有契约 → **加 kind 不影响 H5**。
- `payment/alipay.go` 的 `Launch` 增加 `Client == ClientMPAlipay` 分支（走 `trade.create`），其余保持。
- 顺带解决 `payment-integration.md:198` 记的待决策项：`precreate`（建单时）与 `wap.pay`（唤起时）共用同一 `out_trade_no`，小程序接入后同一单可能对应三种产品 → **把「按端选产品」提前到 `Prepay`** 的时机到了；本文按「仍在 `Launch` 选产品、`Prepay` 只建本站支付单」实施，真渠道沙箱实测后再回来更新那条待决策。

**mock 也要能在小程序里自测（关键，否则资质没下来什么都验不了）**

既定约束是「模拟支付要做真实请求后、回来的数据中进行 mock，整个支付流程不能变，后面准备好支付信息可以直接替换」。落到小程序：

- `payment/launch.go` 的 `mockLaunch`（`:80-91`）按 `env.Client` 分流：H5 仍回 `redirect`（现状不变）；小程序回 **`kind=qrcode`**（复用现契约里已有的「挂起等轮询」语义，`launch.go:22-23` + `frontend/src/payment/launch.js:19-21` 已证明前端拿到 qrcode 只返回 `'pending'` 交给上层轮询）。
- 小程序侧拿到 pending 后展示一个「模拟支付成功 / 失败」的确认层，调 **既有的** `POST /api/payment/mock-notify/{id}`（`payment/http.go:37`，挂在需登录分组下），再轮询 `GET /api/payment/query/{id}`。
- 于是「唤起 → 挂起 → 渠道回执 → 轮询收敛」这段骨架与真实渠道一字不差，且 `settle()` 的幂等与金额复核完全被跑到。P2a 的 CSRF 分流是这条路能通的前提（`mock-notify` 是 POST）。
- 真实渠道切换时只改 `PAY_PROVIDER` 与 `X-Client` 对应的 kind，小程序代码不需要再改一版支付流程。

**验收**：微信开发者工具 + 支付宝小程序 IDE 里，mock 走完「prepay → launch → 挂起 → mock-notify → query 收敛为已支付 → 订单转 paid」，且**重复点确认不会结算两次**（`settleDoc` 条件更新）。

### 3.4 后续（P2g）

- **订阅消息**：`services/admin_order.go` 状态迁移处（`accepted → ready → delivered`）挂发送钩子；`utils/` 新增 `wx_subscribe.go`（模板 ID + 环境变量），通知集合 `notifications` 已是服务端落库，发送侧只是多一路出口。
- **对象存储**：见 §7，实际上应在 P2c 之前就动，因为它是图片能否显示的前提。

---

## 4. 小程序工程与页面

```
miniprogram/
├── config/                  index.js + dev/prod + weapp/alipay 三套编译配置
│                            alias: @common → ../frontend/src
├── src/
│   ├── utils/request.js     ★唯一新增的适配文件：Taro.request + Bearer + X-Client + 401 跳登录页
│   ├── api/                 不复制：直接 import @common/api
│   ├── payment/             复用 @common/payment/{api,providers,index}.js；launch.js 另写 MP 版
│   ├── stores/              复用 @common/stores（只复用客户端状态那类，见 §2.1）
│   ├── hooks/useRequest.js  MP 侧取代 react-query 的薄封装：loading/error/refetch，不引第三方
│   ├── constants/           复用 @common/constants
│   ├── theme/tokens.*       色值与间距单一来源，样式全部手写（§10 决策 3 已定）
│   ├── components/          PageHeader / UnderlineField / Skeleton / ProductTile … 的 Taro 版
│   ├── pages/               MP 页面
│   └── app.config.js        pages 顺序 + 原生 tabBar + 权限与隐私声明
├── project.config.json      微信
└── project.alipay.json      支付宝
```

**P2 第一批（11 屏，对应 H5 路由）**

| 小程序页面 | H5 来源 | 端差异要点 |
|---|---|---|
| 首页 | `/shop` `pages/Shop.jsx` | Banner 自动轮播用 `Swiper`；两列列表 `onReachBottom` |
| 附近门店 / 切店 | `components/StoreSwitcher.jsx` | `getLocation` 授权 + 拒绝兜底（沿用 `utils/locate.js` 返回 `null` 的语义） |
| 搜索 | `/search` | 键盘搜索 → `confirm` 事件 |
| 类目 | `/category/:id` | **切子类目不许闪屏**（既定要求），骨架屏判空 + 常驻结构 |
| 商品详情 | `/product/:id` `pages/Detail.jsx:68` | `window.scrollTo(0,0)` → `pageScrollTo` |
| 购物车 | `/cart` | 多选/试算全在服务端，端只展示 |
| 结算 | `/checkout` | 券与运费试算不动；支付方式按端裁剪（见 §5.2） |
| 支付唤起 + 结果 | `payment/components/PaymentSheet.jsx`、`/payment/result` | kind 分支重写，轮询逻辑共用 |
| 我的订单 | `/orders` | tab 语义沿用 `tab=ongoing/history` |
| 我的 | `/profile` | 商家账号在此露出「发品」入口（§4.1），买家看不到；其余中台能力提示去 H5 |
| 授权登录 | `/login` `pages/Login.jsx` | 小程序静默登录 + 手机号授权；`admin/admin123` 演示预填在小程序里去掉 |

### 4.1 商家发品（2026-09-22 追加，1 屏列表 + 1 屏表单）

| 小程序页面 | H5 来源 | 要点 |
|---|---|---|
| 我的商品 | `pages/admin/AdminProducts.jsx` | 复用 `api/admin.js` 的列表/上下架；`window.confirm` → `Taro.showModal` |
| 发品 / 编辑 | 同页的抽屉表单 | 名称/价格/库存/类目/主图/详情图；图片走既有 `POST /api/upload`（前提＝§7 前置 2 的公网 HTTPS，否则小程序传不上去）；校验规则与 H5 同源，别在小程序里松口径 |

只读概览不做（§1 已划界）。门店作用域继续由 `AdminShopScope` 从 token 推导，**小程序侧不传 `store_id`**，这条安全边界两端一致。

**第二批（延后）**：收藏、我的券、地址（优先 `wx.chooseAddress` / `my.getAddress`）、客服、帮助中心、设置、引导页、找回密码。

**底部 tab**：用小程序原生 `tabBar` 配置，不用 `TabBar.jsx` + `TabStack.jsx` 的常驻挂载方案 —— 后者是为解决 H5 路由重挂闪屏而做的补丁（`product-prototype.md` §5 记的「切 tab 不闪屏」由来），原生 tab 天然满足「切 tab 不闪、tab 页无回退按钮」两条既定约定。

---

## 5. 支付链路三端形态对照

### 5.1 服务端裁决不变的部分

`POST /api/payment/prepay` 建支付单 → `POST /api/payment/launch/{id}` 拿唤起指令 → 客户端按 `kind` 执行 → `POST /api/payment/notify/{provider}`（渠道回调）与 `GET /api/payment/query/{id}`（客户端轮询）双路汇到 `settle()`。金额与订单快照的复核只在 `settle()` 一处，**任何端都不许自己判定支付成功**。

### 5.2 各端 kind

| 场景 | 微信 | 支付宝 | 备注 |
|---|---|---|---|
| H5 手机浏览器 | `redirect`（H5 下单） | `form`（wap.pay 自提交） | 已实现 |
| 微信内置浏览器 | `jsapi` + `WeixinJSBridge` | `form` | 已实现 |
| 桌面 H5 | `qrcode`（Native） | `form`（自带扫码页） | 已实现 |
| **微信小程序** | **`jsapi`** + `wx.requestPayment`（appid 必须小程序的） | 不适用（微信内不能调支付宝） | P2c 新增 appid 位 |
| **支付宝小程序** | 不适用 | **`tradeno`** + `my.tradePay` | P2c 新增 kind |
| mock（任意端，H5） | `redirect` | `redirect` | 现状不变 |
| mock（任意端，小程序） | `qrcode`（挂起）+ `mock-notify` | 同 | §3.3 |

**支付方式裁剪要按端**：小程序内不可能调对面的渠道，所以微信小程序只该出现「微信」、支付宝小程序只该出现「支付宝」。现状的清单在前端（`frontend/src/payment/providers.js` 的 `PROVIDERS` 两条，`pages/Checkout.jsx` 直接渲染成两选一），后端只在下单时校验来值合法（`services/order_service.go:40-41` 的 `orderPaymentMethods` + `:144`），**并不下发可选列表**。因此：

- 小程序侧的裁剪在前端做 —— MP 不复用 `PROVIDERS` 全量，按 `TARO_ENV` 只渲染本端那一条。
- 后端**可选加固**（建议做，成本极低）：`Create` 里除了「值在白名单内」，再加「值与 `X-Client` 不冲突」。不加也不会出资金问题（H5 里选支付宝本来就是合法路径），加了能挡住小程序客户端被改造后传错渠道。
- 这两条都不改任何出参结构，所以 §3 的「后端零业务改动」结论仍然成立。

### 5.3 回跳语义

- H5：整页 302 → `/payment/result?payment_id=`。
- 小程序：无回跳，`wx.requestPayment` 的 success/fail 回调**只作为 UI 提示**，页面 `onShow` 起轮询 `query`；App（P3）是 scheme 回跳 + 同样轮询。
- 「轮询逻辑三端共用且必须单一」是既定契约（`product-prototype.md` §12.3），实现上抽成一个 `payment/usePaymentStatus` 共享 hook，放在 `frontend/src/payment/` 里被两端 import，而不是复制两份。

---

## 6. 账号体系与合并策略

现状：`members` 唯一键是 `email` 与 `mobile`（`config/mongo.go:142-143`），另有 `account_type`（2026-09-22 落的买家/商家字段）与 `sso_user_id`。**没有任何第三方身份位**。

**合并主键 = 平台授权的手机号**（不是用户手填）：

```
小程序首次进入
  → wx.login 拿 code → 后端换 openid（此时还不知道他是谁）
  → 需要下单/看订单时请求手机号授权（getPhoneNumber / my.getAuthCode）
     ├─ 手机号命中 members.mobile  → 把 openid $set 到该会员，签发 token   （合并）
     ├─ 未命中                     → 新建 member（account_type=buyer，手机号已验证）
     └─ 用户拒绝授权               → 只读浏览（可看首页/详情），加购与下单时再拦
```

安全边界（这条必须在代码注释与本文都写明）：静默合并等于「能拿到该手机号平台凭证的人即拥有该账号的订单/地址可见性」。因此**只接受运营商级授权**（`getPhoneNumber` 返回的加密数据经服务端解密，或支付宝 `buyer_id`），**拒绝任何前端手填手机号作为合并依据**。拒绝授权者不得合并，只能新建账号 + 手动密码登录后调 `/api/miniprogram/bind`。

`account_type` 口径：小程序注册路径建的账号一律 `buyer`（商家需要门店名称/地址与中台，留 H5 注册），与 `controllers/context.go markMerchant` 的「有门店即 merchant」推导一致，不会互相打脸。

### 6.1 前置改造：手机号成为登录凭据 + 中国大陆校验（2026-09-22 追加需求）

合并主键是手机号，那手机号就必须先「能用」——现状它连登录都进不去，校验还写死了马来西亚号段：

| 位置 | 现状 | 改为 |
|---|---|---|
| `services/member_service.go:27` | `mobileRe = ^60\d{9,11}$` | `^1[3-9]\d{9}$`（中国大陆 11 位），`ValidateMobile` 的注释与提示文案同步 |
| `services/member_service.go:171-183 FindByAccount` | `$or` 只有 `email` / `username` | 加 `{"mobile": account}`，`AuthService.Login`（`auth_service.go:67`）走的就是这个函数，因此**一处改动即让手机号可登录**，SSO 后台账号优先级不变（先查 MySQL 再查会员） |
| H5 注册页 | 手机号提示按旧号段 | 文案 + 前端校验同步为大陆号段 |
| H5 登录页 | 账号框写「Email」 | 提示改「邮箱 / 用户名 / 手机号」，不做输入格式限制（后端 `$or` 兜住） |
| `seed/seed.go` | 会员手机号是 `60...` 旧号段 | 换成合法大陆号段，保证演示数据在新规则下自洽 |

三条必须写清的边界：

1. **这是破坏性变更**：存量会员（含用户手工建的 `admin1@qq.com`）手机号若是 `60...`，登录不受影响（邮箱/用户名照样进），但**再次保存资料时会被新校验拦下**，需要用户改填大陆号码。不做静默改写存量数据，也不放宽校验放它过去——迁移不是本次授权范围。
2. 唯一索引 `mobile` 保持不变，所以「手机号已注册」的冲突提示继续有效，小程序合并靠的就是这个唯一性。
3. 手机号可登录不等于手机号可注册即验证：注册路径的 `mobile` 仍是用户自填，**小程序合并只认平台授权解密出来的手机号**（§6 安全边界），两者不可混淆。

---

## 7. 前置条件（非代码，会卡住联调，建议现在就去办）

| # | 事项 | 卡住什么 |
|---|------|---------|
| 1 | **公网 HTTPS + ICP 备案域名**，并在两个平台后台填 `request` / `uploadFile` 合法域名 | 小程序里一个接口都发不出去（开发者工具需另勾「不校验合法域名」，真机必须备案域名） |
| 2 | **素材迁对象存储 / CDN** | 现在图片走本地 `./uploads`（`product-prototype.md` §10 低优先项），小程序加载不了 `http://localhost:8080/...`；主包又限 2MB。**这笔债从 P3 提前到 P2 硬前置** |
| 3 | 微信支付商户号**关联小程序 appid** | JSAPI 下单 |
| 4 | 支付宝小程序**签约「小程序支付」** | 与「手机网站支付」「当面付」是分开审批的 |
| 5 | 小程序类目与资质（生鲜自营 → 食品经营许可） | 审核上架 |
| 6 | 隐私协议与授权用途声明（`getLocation`、手机号） | 不调声明即被拒 |
| 7 | `*_NOTIFY_URL` 从 `localhost` 换成公网 HTTPS（`payment/settings.go:57,68`） | 真实渠道回调进不来 |

---

## 8. 分期与工作量

| 阶段 | 内容 | 人日 | 出口条件 |
|---|---|---|---|
| **P2-0** | 手机号：中国大陆校验 + `FindByAccount` 支持手机号 + H5 登录/注册文案 + seed 号段 | 1 | H5 用手机号+密码能登录；旧 `60` 号段注册被拒且提示明确 |
| P2a | 端标识 + CSRF 分流 + openid 服务端解析 | 1.5 | Bearer 写接口全通；H5 三条主流程零回归 |
| P2b | 小程序登录绑定 + 手机号授权合并 + 索引（身份换取支持确定性 mock） | 2 | 小程序登录 → `/api/auth/me` 与 H5 同一 member |
| P2c | 支付形态：小程序 appid 位 + `tradeno` kind + mock 分流 | 2 | 双端 IDE 里 mock 走完并收敛为 paid，重复确认不双结算 |
| P2d-1 | 工程骨架 + `theme/tokens` 手写样式体系 + `request.js` + `useRequest` | 2 | 一端编译出包，首页能拉到真实接口数据 |
| P2d-2 | 买家 11 屏移植 | 8 | 微信真机走通「浏览 → 加购 → 结算 → mock 支付 → 订单」 |
| P2e | **商家发品**（我的商品列表 + 发品/编辑表单 + 图片上传） | 4–5 | 商家账号在小程序发一条商品，H5 中台立刻可见且字段一致 |
| P2f | 支付宝 target（`getAuthCode` 登录 + `trade.create` + 样式差异） | 3–4 | 支付宝真机同上 |
| P2g | 真实渠道切换（等 §7 资质）+ 对账冒烟 + 订阅消息 | 2 + 等待 | `PAY_PROVIDER` 切正式，H5 与小程序同时不回归 |

合计 **约 24–25 人日**（不含设计、不含 §7 行政等待）。前置项 1–2（域名 + 对象存储）建议与 P2-0/P2a 并行开工。

**已定的推进方式**（§10 决策 4）：P2-0 → P2e 全量用 `localhost + mock` 开发自测，域名备案、小程序资质、对象存储由用户并行办；等 §7 就绪时只替换密钥与 `PAY_PROVIDER`，不改任何流程代码。

> ⚠️ 与本文并行、且优先级更高的存量资损项：`product-prototype.md` §10 的 **H1（下单不校验库存且忽略 `MatchedCount`）/ H2（改数量不比对库存）/ H4（无幂等下单、`order_no` 秒级撞号且无唯一索引）**。小程序弱网重连与双击更频繁，这三个不补，上线小程序等于放大超卖概率。

---

## 9. 风险与应对

| # | 风险 | 应对 |
|---|------|------|
| 1 | ~~react-query v5 与 Taro 的 React 版本差~~ | **已消除**：2026-09-22 拍板「不成熟就不用」，MP 侧不引 react-query，改本地 `useRequest` 薄封装 + 复用 `api/*`。残留风险：11 个 H5 数据 hook 要逐屏重写取数与竞态处理，工时已计入 P2d-2 |
| 2 | ~~Tailwind 转换覆盖不全~~ | **已消除**：拍板「有风险就不复用」，不做 `weapp-tailwindcss` 转换，样式全部手写 rpx。残留风险：① 视觉与 H5 的一致性靠人工比对，没有自动等价保证；② 色值/间距必须只从 `theme/tokens` 取，否则又回到 H5「74 个色值散落 503 处」那笔债 |
| 3 | **双端差异**：Taro 的 alipay target 成熟度低于 weapp，flex/尺寸细节不同 | 这是「一套代码」的真实成本，允许留 `process.env.TARO_ENV` 分支；P2f 单独排期，不与 P2d 混在一起验收 |
| 4 | **H5 回归**：P2a 动的是全局中间件 | 每阶段必须跑完 §9.1 的三条主流程自测再说完成 |
| 5 | **账号合并的两义性**（§6） | 只认平台授权手机号；拒绝授权不合并 |
| 6 | 小程序审核周期与类目资质不确定 | 双端各留一个审核缓冲；先用体验版验证真机支付 |

### 9.1 每阶段的自测清单（沿用既定「先自测流程再报完成」）

1. **H5 不回归**：登录 `admin/admin123` → 首页/类目/搜索不闪屏 → 加购 → 结算 → mock 支付 → 订单转已支付；商家账号进 `/admin` 改订单状态；买家账号进 `/admin` 仍 403。
2. **小程序**：静默登录 → `/api/auth/me` 身份正确 → 附近门店定位与拒绝兜底 → 加购/改数量 → 结算 → 唤起支付（mock）→ 轮询收敛 → 订单列表可见 → 重复唤起不产生第二笔支付单。
3. **闸门**：`/usr/local/go/bin/gofmt -l .`、`go build ./...`、`go vet ./...`、`npx oxlint src`（0/0）、`npm run build`、`swag init`，小程序侧另加两端 IDE 的真机预览。
4. ⚠️ 本地库有真实数据时**禁止 `seed`**（会 drop 全部集合）；自测产生的测试账号/门店测完即删，并核对删除范围只含本次新建的 `_id`。

---

## 10. 决策记录（2026-09-22 已拍板，按此执行）

| # | 决策 | 结论 | 落地位置 |
|---|------|------|---------|
| 1 | 账号合并口径 | **用平台授权的手机号**合并，手填不认 | §6 安全边界、P2b |
| 2 | 框架 | **Taro 4 + React 一套出双端** | §4 工程结构、P2d-1 |
| 3 | 样式 | **不复用 Tailwind，全部手写**（"既然复用有风险就不复用"） | §2.2、`theme/tokens`、P2d-1 |
| 4 | 前置条件 | **先 localhost + mock 全量跑通**，资质与备案由用户并行办，后续直接切换 | §8 推进方式、P2g |
| 5 | 中台是否移植 | **要移植「商家发品」**，其余中台路由仍不做 | §1 非目标、§4.1、P2e |
| 6 | react-query | **不用**（"不成熟就不要用，以安全稳定为核心"） | §2.2、§4 `useRequest` |
| 7 | 手机号 | **以手机号为准**：H5 也要支持手机号登录，校验改成**中国大陆号段** | §6.1、P2-0 |

未单独点到的其余项按本文推荐默认执行（含：`X-Client` 显式端标识、openid 服务端查库解析、`tradeno` kind、mock 走 `qrcode` 挂起语义、后端加「渠道与端不匹配」的可选加固、订阅消息排在 P2g）。

---

## 11. 实施时要同步更新的文档

- `docs/api.md`：新增 §2.x 小程序登录三端点；下单支付方式按端校验（若做 §5.2 的加固）；`Launch` kind 对照表。
- `docs/payment-integration.md`：`:195` 的「P3 计划」旁补「小程序支付」行；`:198` 的 `precreate`/`wap.pay` 待决策按 §3.3 的实测结论收口。
- 已随本文同步：`README.md` 文档树、`product-prototype.md` §12 的互指。开工后仍需补：§10 缺点表里 H1/H2/H4 的优先级说明追加「小程序放大」。
- `miniprogram/` 目录建立时在 `README.md` 补工程说明与双端启动命令。
- 本文件：每阶段完成时在 §8 表格后追加「已完成」标记与实际人日。

---

## 12. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-09-22 | 首次定稿。方案基于当日读源码核实的事实：`middleware/csrf.go:35-44` 的豁免清单与 Bearer 写请求实测 403、`payment/launch.go:15-23` 的四种 kind 契约、`payment/http.go:125` 由客户端传 openid、`payment/wechat.go:98-103` 的 JSAPI 分支、`frontend/src` 的 503 处 arbitrary class 与 65 个 ES module 素材、10 个 zustand store 无 `persist()`。**未开工**。 |
| 2026-09-22（当日） | 用户拍板 §10 全部决策点，方案转执行：基线提交并推 `github.com:xueguiyouheng/h5.git` 的 `main`，开工分支 `feat/miniprogram-p2`。变更四处 —— ① react-query 与 Tailwind 双双判定**不复用**（安全稳定优先），MP 侧 `useRequest` + 手写 rpx；② 中台**要移植商家发品**，新增 §4.1 与 P2e（+4~5 人日），总量升至约 24–25 人日；③ 新增 §6.1 前置改造（手机号可做登录凭据 + 中国大陆校验，现为马来西亚号段 `^60\d{9,11}$`），排为 P2-0；④ §8 拆出 P2d-1/P2d-2，明确「先 mock 跑通、资质并行、后续直接替换」的推进方式。 |
