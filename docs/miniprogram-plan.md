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
- 第二批买家页面（券 / 客服 / 帮助 / 设置 / 引导页）先不移植，见 §4 结尾。（收藏页已在 2026-09-23 随第一批补齐，地址页同批落地。）

---

## 2. 复用清单

> 硬约束：动手前先确认复用面。下表右列是判定依据，不是推测。
>
> ⚠️ **2026-09-23 更正（用户拍板，覆盖本文原「共享源码」写法）**：前端**按端各自独立工程、独立构建、独立部署** —— H5（`frontend/`）、微信小程序、支付宝小程序、后续的 App 互不引用，**不做跨工程 import、不设共享包/workspace**。因此下表里的「复用」一律指**把文件移植进 `miniprogram/src/` 再按端演进**；真正的共享面只有 `/api/*` 的 JSON 契约与后端一处业务口径。这也意味着同一处缺陷（如本轮修的支付弹窗返回重弹、收藏加购后移出收藏）要在各端各改一次，移植时逐屏比对。

### 2.1 移植过去，逻辑一行不改

| 资产 | 依据 |
|------|------|
| 全部 `/api/*` 接口与 `models/*.go` 出参 JSON | 后端不感知端；`payment/launch.go:26` 的 `LaunchEnv` 当初就是为换端留的口子 |
| `payment/` 后端模块 | `Provider` 五方法接口（`payment/provider.go:44-51`）、`settle()` 幂等 + 双向金额复核、超时惰性关单 —— 与端无关 |
| `GET /api/payment/query/{id}` 轮询 | 三端共用的唯一收款确认路径，**必须保持单一，不许各端另起判断** |
| `frontend/src/api/index.js`、`api/admin.js`、`payment/api.js` | 三者都只经 `utils/request.js` 这一个出口发请求（`api/index.js:3`、`api/admin.js:1`、`payment/api.js:3`）→ **整文件拷进 `miniprogram/src/api/`，只换 `utils/request.js` 一个实现**；拷贝后两端各自演进，字段口径变更要在 `docs/api.md` 对齐 |
| `frontend/src/stores/*.js` 10 个 zustand store | 已核实**零 `persist()` 中间件**，不读写 localStorage，运行时无关。**只移植「客户端状态」那一类**（当前门店、选中的购物车行、收银台开关等）；任何承担取数职责的 store 在 MP 侧配本地 `useRequest` 用，不与 react-query 混用 |
| `constants/orderStatus.js`、`constants/adminOrder.js` | 纯数据映射，直接移植。⚠️ `adminOrder.js` 与后端状态机双写，改状态机时**三处同步**（H5 / MP / 后端，`product-prototype.md` §5 已记） |
| 设计稿几何 | 375 屏 → 750rpx，现有 `pl-[43px]` / `h-[47px]` 一律 **px×2=rpx** 机械换算 |
| 配色体系 | `#00b861` 主按钮绿 / `#f9f8f6` 卡底 / `#f4f5f7` 分隔线 / `#8b8b8b`·`#b6bbb9` 次要文字 / `#f50000` 错误 / 支付宝 `#1677ff` / 微信 `#07c160`（`payment/providers.js` 的值移植进 `miniprogram/src/theme/tokens`） |
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

### 3.1 P2a 端标识与凭证载体（1.5 人日）— ✅ 2026-09-22 已完成

**(1) CSRF 按载体分流 —— 换端的第一道墙**

现状（已实测）：只带 `Authorization: Bearer` 而不带 Cookie 的写请求会被 **403「CSRF 防护：缺少 CSRF Cookie」**。`middleware/csrf.go:35-44` 的豁免只有 4 条引导端点 + `/api/payment/notify/` 前缀；而 `middleware/jwt.go:76-88` 的 `extractToken` **已经支持 Bearer 回落**，`POST /api/login` 的响应体也已经回 `LoginResponse{Token, TokenType:"Bearer"}`（`controllers/auth_controller.go:58-61`）。所以缺的不是鉴权，是 CSRF。

改法（**不往白名单加路由**）：

- `middleware/jwt.go`：`extractToken` 改为同时回令牌与载体（`CarrierCookie` / `CarrierBearer` / `CarrierNone`），新增导出 `TokenCarrier(c)` 复用同一份判定。
- `middleware/csrf.go`：写操作在豁免判断之后、Cookie 校验之前插入 `if TokenCarrier(c) == CarrierBearer { c.Next(); return }`。

> ⚠️ 落地时对本文原方案做了一处必要修正：原写「jwt.go `c.Set("authCarrier")`，csrf.go 读这个 key」，但 `routers/router.go` 里 CORS/CSRF/Response 是**全局**中间件、`JWTAuthMiddleware` 只挂在 `protected` 分组上 —— CSRF 跑在 JWT **之前**，读不到鉴权阶段写的 context。因此载体判定做成不依赖执行顺序的纯函数 `TokenCarrier(c)`，与 `extractToken` 同源同口径（Cookie 优先，只有「无 Cookie 且带 Bearer」才算 bearer）。

安全性论证（已写进注释）：double-submit cookie 存在的唯一理由是**浏览器会自动携带 Cookie**，攻击者无法读取但能迫使发出；`Authorization` 头不会被跨站自动携带，因此对 Bearer 请求这一防线无攻击面。**Cookie 会话路径的校验逻辑一字不改**；同时带 Cookie 与 Bearer 时按 Cookie 处理（fail-closed），实测仍 403。

**(2) 端标识显式化，不再靠 UA 嗅探**

- `payment/launch.go`：`LaunchEnv` 增 `Client string`，常量 `ClientH5` / `ClientMPWechat` / `ClientMPAlipay` / `ClientApp`（取值与 `X-Client` 头字面量一致）。
- `payment/http.go`：新增 `clientOf(ctx)` 从 `X-Client` 读，**未知取值一律回落 `h5`**（拼错的头不能改变收款产品）。CORS 的 `Access-Control-Allow-Headers` 加 `X-Client`。
- `payment/wechat.go` 的分流条件由 `IsWechatBrowser(env.UserAgent)` 改为 `env.Client == ClientMPWechat || IsWechatBrowser(env.UserAgent)`。原因：小程序请求的 UA 不可依赖，JSAPI 必须按端**强制**，否则可能被判成 H5 并回一个跳不出去的 `redirect`。`IsWechatBrowser` 保留给 H5 内部浏览器场景。

**(3) openid 不许由客户端自报**

- 原状：`payment/http.go` 的 `OpenID: ctx.Query("openid")` —— 信任客户端传入的付款人身份。H5 场景没有 openid 所以没暴露，小程序一接就是真问题。
- 改法：`payment/http.go` 增 `Payer` 与 `PayerFunc`，与既有 `MemberFunc` 同构，保持 payment 不 import 会员代码：
  ```go
  type Payer struct{ WxOpenID, AlipayUserID string }
  type PayerFunc func(memberID string) (Payer, error)
  ```
  `NewModule(orders, memberID, payer)` 三参注入；`launch` 改为 `m.payer(memberID)` 后按字段填 `LaunchEnv.OpenID/AlipayUserID`，解析失败直接返回错误而不是「空 openid 继续」。接线在 `controllers/payment_module.go MemberPayer`，走 `memberService.ByID`。
- **一处提前**：`models.Member` 的 `WxOpenID` / `AlipayUserID`（`json:"-"`）本属 P2b，但「服务端解析」要有可读之处才成立，故随 P2a 落地；`WxUnionID` 与两条唯一索引仍留 P2b（合并逻辑才用得上）。
- 未采用方案：往 JWT claims 里塞 openid（`utils/jwt.go:18-24` 的 `Claims` 目前没有该字段）。优点每次请求少一次 Mongo 查询；代价是要动签名结构、且换绑/解绑后旧 token 仍带着过期 openid。**先按查库实现**，量大了再优化。

**验收（2026-09-22 实测，`PAY_PROVIDER=mock`）**：

| 场景 | 结果 |
|---|---|
| 仅 Bearer（无 Cookie 无 CSRF 头）：加购 / 建地址 / 下单 / prepay / launch / mock-notify / query | 全 200，支付单收敛为 `success` |
| Cookie 会话缺 CSRF 头 / 头值不匹配 | 403（语义与改造前一致） |
| Cookie 会话 + 正确 CSRF 头 | 200 |
| Bearer + 浏览器 Cookie 同时存在且无 CSRF 头 | 403（按 Cookie 载体处理，未放宽） |
| 裸 token 无 `Bearer` 前缀 | 403「缺少 CSRF Cookie」 |
| `launch` 带 `?openid=ATTACKER_SELF_REPORTED` | 200 且行为与不带一致；代码层 `ctx.Query("openid")` 已全清（grep 无残留） |
| `X-Client: mp_wechat` / 非法值 | 均 200，mock 下回 `redirect`（契约不变）；非法值回落 h5 |
| H5 三条主流程 | 前端零改动，oxlint 0/0 + `npm run build` 通过；Cookie 路径的接口矩阵与上表一致 |

> openid「取自库里而非请求」的**运行期**证据要等真实渠道（`PAY_PROVIDER=wechat` 下 `Prepay` 就要外呼，MOCK 私钥走不通），当前只有代码层与「自报参数不改变结果」两层证据，记在 P2g 复验。


### 3.2 P2b 小程序账号打通（2 人日）— ✅ 2026-09-23 已完成

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
| `POST /api/miniprogram/alipay/login` | `{auth_code}` | `alipay.system.oauth.token` → `buyer_id`(2088) → 同上。**2026-09-23 调整：随 P2f 一起落**，见落地记录 4 |
| `POST /api/miniprogram/bind` | ~~`{target, verify}`~~ → `{code}` | 已登录状态下把 openid/支付宝 uid 绑到当前会员（用户在小程序里手动密码登录一次即完成合并）。**落地时改为只收 `code`**，见落地记录 1 |

- 出参结构与 `POST /api/login` 完全一致（`models.LoginResponse{token, token_type:"Bearer"}`），前端不新增分支。
- 小程序侧把 token 存 `Taro.setStorageSync`，后续每个请求带 `Authorization` + `X-Client`。
- 密钥口径沿用既定约束：**只从环境变量进，不落库、不写日志、不出现在响应**（同 `payment/settings.go` 顶部注释与 `product-prototype.md` §5「支付安全」）。新增：`WX_MP_APP_ID` / `WX_MP_APP_SECRET` / `ALIPAY_MP_APP_ID` / `ALIPAY_MP_PRIVATE_KEY` / `ALIPAY_MP_PUBLIC_KEY`。缺省值一律含 `MOCK` 字样。
- **登录也要能先 mock 跑通、后续直接替换**（与支付同一条既定原则）：`code2session` / `alipay.system.oauth.token` 的真实 HTTP 调用是唯一主路径，只有当对应 appid 缺失或以 `MOCK` 开头时才走确定性假解析（`code` → 稳定派生的 openid/buyer_id），**分支只放在「换取身份」这一步，合并与签发 token 的代码一行不差**。这样资质到位后换密钥不换流程，和 `PAY_PROVIDER=mock` 的处置方式一致。
- CSRF：这两个登录端点是 POST 且此刻客户端还没有任何会话，语义与 `/api/login` 相同 → 加入 `csrfExemptPaths`（`middleware/csrf.go:35-40`）并在注释写明理由；`/api/miniprogram/bind` 是已登录态的写操作，**不豁免**，靠 P2a 的 Bearer 分流通过。

**验收**：同一手机号在 H5 注册、在小程序登录 → 拿到同一个 `member_id`，`/api/auth/me` 返回的订单/收藏/地址与 H5 完全一致。

**落地记录（2026-09-23，`PAY_PROVIDER=mock` + `WX_MP_APP_ID` 未注入）**

1. **`/api/miniprogram/bind` 只收 `{code}`**，与本文原设计的 `{target, verify}` 不同：`target` 是「要绑哪个身份」、`verify` 是「二次验证」，但绑定的双方其实都已经确定——会员来自 JWT、openid 来自服务端用 `code` 重新换取。让客户端自报 openid 等于允许把**别人的收款身份**挂到自己账号上（P2a 刚清掉 `?openid=` 同一类问题），二次验证也没有可验的对象（这条链路不改密码）。
2. **新建账号的三个占位**是数据层约束逼出来的，不是随手拼的：`email` 上有唯一索引且 `Member.Email` 不带 `omitempty`，所以小程序账号必须有唯一邮箱 → 用 `wx-<手机号>@mp.local`（手机号本身唯一，口径同 `EnsureForSSOUser` 的 `@sso.local`）；`nameRe` 只收字母，手机号编不进姓名 → 姓名固定 `Wechat User`，用户可在资料页改；引导页是 H5 独有屏（§4 把它列在第二批），`onboarded` 留 false 会让小程序首登卡在看不到的页面 → 置 true。密码随机（同 `EnsureForSSOUser`），所以这条路建出来的账号在用户主动找回密码之前无法用口令登录。
3. **模拟身份的手机号口径**：`WX_MP_APP_ID` 含 `MOCK` 时，`phone_code` 若本身是 11 位号码就当平台授权结果使用，否则按 `sha256(code)` 派生大陆号段假号。这是让「H5 注册 → 小程序同手机号登录 → 同一 `member_id`」这条验收在没有平台资质时也能跑起来的前提；真实渠道下手机号只可能来自 `getuserphonenumber` 的解密结果，这个分支根本不执行。
4. **`/api/miniprogram/alipay/login` 挪到 P2f**：支付宝小程序是**另一个应用**（`§3.3` 已说明 `trade.create` 需要小程序应用的密钥），`alipay.system.oauth.token` 必须用那套 `ALIPAY_MP_*` 密钥做 RSA2 签名才能调通。在本阶段落这个端点只能交出一个「只有 mock 分支、真分支缺密钥」的空壳，且要把 `payment/crypto.go` 的签名底座复制一份到 services（跨模块复用等于让鉴权依赖支付模块）。P2f 会连同 `trade.create`、`my.tradePay`、密钥一起实现。
5. **`access_token` 做了进程内缓存**（提前 60s 过期）：微信 `cgi-bin/token` 按调用次数计配额，每次手机号授权都取一次会很快打满。
6. 验收矩阵（28 条断言全通过，脚本 `/tmp/p2b_selftest.py`）：

| 场景 | 结果 |
|---|---|
| H5 注册（手机号 13900000001）→ 小程序带 `phone_code` 登录 | 200，`member_id` 与注册返回的**同一个**；H5 Cookie 会话与小程序 Bearer 读到**同一条收货地址** |
| 出参结构 | 与 `POST /api/login` 一致（`token` + `token_type:"Bearer"`），不回 Cookie |
| 同一 `code` 二次登录（不带 `phone_code`） | 200，命中 `wx_openid` 直接签发，同一账号 |
| 未注册手机号首登 | 200，新建 `account_type=buyer`、`username="Wechat User"`、`email=wx-13712340000@mp.local`、`onboarded=true` |
| 只给 `code` 不给 `phone_code`（新人） | 422「需要授权手机号才能完成登录」，不发令牌 |
| 平台返回非大陆号码 | 422「授权手机号不是有效的中国大陆号码」，库里无残留 |
| 密码登录 → `/api/miniprogram/bind` | 200（Bearer 载体过 CSRF）；随后同一 `code` 静默登录即命中该账号 |
| 同一 openid 绑第二个账号 | 409「该微信已绑定其他账号」 |
| 已绑微信的手机号被另一个 openid 合并 | 409「该手机号已绑定其他微信，请先解绑或用密码登录」 |
| 请求体注入 `openid` / `member_id` / 他人手机号 | 注入字段不参与；openid 已绑则仍回**它自己的**账号，他人手机号被 409 挡下 |
| 无凭证调 bind | 403「缺少 CSRF Cookie」（CSRF 跑在 JWT 之前，未放宽） |
| Cookie 会话缺 `X-CSRF-Token` / 值不匹配 | 403「CSRF 校验失败」，与改造前一致 |
| 身份字段泄露面 | `/api/auth/me` 出参无 `wx_openid`/`wx_unionid`；库里存的是 `mock-openid-*`，`session_key` 不接进进程 |
| 索引 | `members` 上 `wx_openid`/`wx_unionid`/`alipay_user_id` 三条 unique+sparse 已建，存量 4 个会员未受影响 |

> 真实分支（`WX_MP_APP_ID` 为非 MOCK 值时的外呼与失败闭锁）与 `PAY_PROVIDER=wechat` 一样要等资质，运行期证据统一记在 P2g 复验；本阶段只有代码层证据：分岔点在 `mpWechatFetch` 一处，真实分支不带任何假数据。

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
miniprogram/                   ← 独立工程：自带 package.json / node_modules / 构建脚本 / 部署产物
├── config/                    index.js + dev/prod + weapp/alipay 三套编译配置
│                              ★ 不设指向 ../frontend 的 alias，工程外零依赖
├── src/
│   ├── utils/request.js       ★Taro.request + Bearer + X-Client + 401 跳登录页
│   ├── api/                   从 frontend/src/api 移植一份（含 admin.js），移植后各自演进
│   ├── payment/               从 frontend/src/payment 移植 api.js/providers.js；launch.js 另写 MP 版
│   ├── stores/                从 frontend/src/stores 移植「客户端状态」那类（见 §2.1）
│   ├── hooks/useRequest.js    MP 侧取代 react-query 的薄封装：loading/error/refetch，不引第三方
│   ├── constants/             从 frontend/src/constants 移植
│   ├── theme/tokens.*         色值与间距单一来源，样式全部手写（§10 决策 3 已定）
│   ├── components/            PageHeader / UnderlineField / Skeleton / ProductTile … 的 Taro 版
│   ├── pages/                 MP 页面
│   └── app.config.js          pages 顺序 + 原生 tabBar + 权限与隐私声明
├── project.config.json        微信
└── project.alipay.json        支付宝

frontend/                      ← H5 独立工程（现状不变），构建产物只服务 H5 部署
```

**部署边界（2026-09-23 用户拍板）**：`frontend/` 与 `miniprogram/` 是**两个独立可部署单元**，各自 install / build / 发布，任何一方构建失败都不能阻塞另一方；后来的 App 同理再开一份独立工程。两端唯一的共同契约是 `/api/*` 的 JSON 与 `docs/api.md`。**不做 workspace、不做跨目录 import、不做共享 npm 包** —— 与 §10 决策 3「复用有风险就不复用」同源：共享源码会让 H5 的一次重构静默改坏小程序，代价不可控。移植（拷贝）产生的差异靠各端自测清单（§9.1）与各目录的 README 记录来收。

工程内的 weapp / alipay 双 target 仍是同一份 Taro 代码（§10 决策 2，用户已拍板），与本条不冲突：那是同一个可部署单元内部的两个编译目标，产物分别上传两个平台。

**P2 第一批（14 屏，对应 H5 路由；2026-09-23 落地时比原表多两屏 —— 「支付唤起 + 结果」拆成收银台 + 独立结果页，订单详情从列表里独立出来；收藏页原列第二批，为与 H5 功能对等提前补进第一批）**

| 小程序页面 | H5 来源 | 端差异要点 |
|---|---|---|
| 首页 | `/shop` `pages/Shop.jsx` | Banner 自动轮播用 `Swiper`；两列列表 `onReachBottom` |
| 附近门店 / 切店 | `components/StoreSwitcher.jsx` | `getLocation` 授权 + 拒绝兜底（沿用 `utils/locate.js` 返回 `null` 的语义） |
| 搜索 | `/search` | 键盘搜索 → `confirm` 事件 |
| 类目 | `/category/:id` | **切子类目不许闪屏**（既定要求），骨架屏判空 + 常驻结构 |
| 商品详情 | `/product/:id` `pages/Detail.jsx:68` | `window.scrollTo(0,0)` → `pageScrollTo` |
| 购物车 | `/cart` | 多选/试算全在服务端，端只展示 |
| 结算 | `/checkout` | 券与运费试算不动；支付方式按端裁剪（见 §5.2） |
| 支付唤起 + 结果 | `payment/components/PaymentSheet.jsx`、`/payment/result` | kind 分支重写，**收款确认仍只认 `GET /api/payment/query/{id}` 这一条**（各端各一份实现，口径唯一）；结果面板的「可关闭 + 不重弹」按 H5 本轮修复后的同一套语义实现 |
| 我的订单 / 订单详情 | `/orders`、`/orders/:id` | tab 语义沿用 `tab=ongoing/history`；详情页给「去支付（续付）/ 取消订单」两个动作，取消要二次确认 |
| 收货地址 | `/address` | 与结算页之间用 storage 交接选中项（`navigateBack` 带不了返回值）；校验按 H5 同口径（标签 2-16、明细 ≥12 且要含分隔逗号） |
| 我的收藏 | `/favorites` `pages/Favorites.jsx` | 列表就是商品列表接口的 `favorite=true`，行间搜索再叠一个 `q`；**一键加购成功后这批同时移出收藏**（移出失败只提示，不误报加购失败）；售罄行不给勾 |
| 我的 | `/profile` | 商家账号在此露出「发品」入口（§4.1），买家看不到；其余中台能力提示去 H5 |
| 授权登录 | `/login` `pages/Login.jsx` | 小程序静默登录 + 手机号授权；`admin/admin123` 演示预填在小程序里去掉 |

### 4.1 商家发品（2026-09-22 追加，1 屏列表 + 1 屏表单）

| 小程序页面 | H5 来源 | 要点 |
|---|---|---|
| 我的商品 | `pages/admin/AdminProducts.jsx` | 复用 `api/admin.js` 的列表/上下架；`window.confirm` → `Taro.showModal` |
| 发品 / 编辑 | 同页的抽屉表单 | 名称/价格/库存/类目/主图/详情图；图片走既有 `POST /api/upload`（前提＝§7 前置 2 的公网 HTTPS，否则小程序传不上去）；校验规则与 H5 同源，别在小程序里松口径 |

只读概览不做（§1 已划界）。门店作用域继续由 `AdminShopScope` 从 token 推导，**小程序侧不传 `store_id`**，这条安全边界两端一致。

**第二批（延后）**：我的券、客服、帮助中心、设置、引导页、找回密码。（原表里的「收藏」与「地址」已随第一批落地：地址页在 P2d-2，收藏页在 2026-09-23 补齐以与 H5 功能对等。）

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
| **支付宝小程序** | 不适用 | **`tradeno`** + `my.tradePay` | 挪 P2f（缺支付宝小程序应用的密钥与 `trade.create` 报文） |
| mock（任意端，H5） | `redirect` | `redirect` | 现状不变 |
| mock（任意端，小程序） | `qrcode`（挂起）+ `mock-notify` | 同 | §3.3，2026-09-23 已落地 |

**支付方式裁剪要按端**：小程序内不可能调对面的渠道，所以微信小程序只该出现「微信」、支付宝小程序只该出现「支付宝」。清单在前端（`frontend/src/payment/providers.js` 两条，MP 侧 `miniprogram/src/payment/providers.js` 按端各留一条），后端下单时只校验来值合法（`services/order_service.go:40-41` 的 `orderPaymentMethods` + `:144`），**不下发可选列表**。因此：

- 小程序侧的裁剪在前端做 —— MP 不复用 `PROVIDERS` 全量，按 `TARO_ENV` 只渲染本端那一条。
- **后端加固已于 2026-09-23 落地**（`payment/launch.go` 的 `providerAllowedForClient`）：`prepay` 建单与 `Service.Launch` 唤起两处都比一次「渠道 ↔ `X-Client`」，`mp_wechat` 只收 `wechat`、`mp_alipay` 只收 `alipay`、`h5`/`app` 两渠道都放行，不匹配回 422。拦在**支付模块**而不是订单 `Create`：订单上的 `payment_method` 是用户当次的意向，跨端续付（H5 建单、小程序续付）本来就允许换渠道，硬绑在订单上会把合法路径堵死。
- 两条都不改任何出参结构，所以 §3 的「后端零业务改动」结论仍然成立。

### 5.3 回跳语义

- H5：整页 302 → `/payment/result?payment_id=`。
- 小程序：无回跳，`wx.requestPayment` 的 success/fail 回调**只作为 UI 提示**，页面 `onShow` 起轮询 `query`；App（P3）是 scheme 回跳 + 同样轮询。
- 「轮询逻辑三端共用且必须单一」是既定契约（`product-prototype.md` §12.3）。**按决策 8 的落地方式**：单一指的是「一端一份、同一套语义」，不是跨工程 import —— H5 与小程序各自持有 `payment/usePaymentStatus`（3s 轮询、终态才判定、超时收敛），改动时要两端各同步一次。

---

## 6. 账号体系与合并策略

现状：`members` 唯一键是 `email` 与 `mobile`（`config/mongo.go:142-143`），另有 `account_type`（2026-09-22 落的买家/商家字段）与 `sso_user_id`。**没有任何第三方身份位**。

**合并主键 = 平台授权的手机号**（不是用户手填）：

```
小程序首次进入
  → wx.login 拿 code → 后端换 openid（此时还不知道他是谁）
  → openid 已绑过会员 → 直接签发 token（静默登录，无感进入）
  → 未绑 → 传输层整端 reLaunch 到登录页（**不开放匿名浏览**，2026-09-24 确认；2026-09-26 起不再等人点闸门，见 §6.3）：
     ├─ 主路径：账号密码登录（手机号/邮箱/用户名任一，与 H5 同一账号同一口令）→ 立刻尝试 /miniprogram/bind 绑身份
     ├─ 次级：平台手机号授权（getPhoneNumber / my.getAuthCode）
     │    ├─ 手机号命中 members.mobile → 把 openid $set 到该会员，签发 token   （合并）
     │    └─ 未命中                     → 新建 member（手机号已验证）
     └─ 没有账号 → 小程序内注册页（字段照 H5 一套，含商家门店字段）
  → 登录成功那一次：取定位 → 落到**最近的营业中门店** → 进首页（§6.3）
```

安全边界（这条必须在代码注释与本文都写明）：静默合并等于「能拿到该手机号平台凭证的人即拥有该账号的订单/地址可见性」。因此**只接受运营商级授权**（`getPhoneNumber` 返回的加密数据经服务端解密，或支付宝 `buyer_id`），**拒绝任何前端手填手机号作为合并依据**。拒绝授权者不得合并，只能新建账号 + 手动密码登录后调 `/api/miniprogram/bind`。

`account_type` 口径：小程序授权登录建的账号一律 `buyer`（平台只给号码，不给店址）；小程序**注册页**（2026-09-24 起）与 H5 同字段，因此也能选商家并建店，与 `controllers/context.go markMerchant` 的「有门店即 merchant」推导一致，不会互相打脸。

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

### 6.2 小程序登录主路径改为账号密码（2026-09-24，用户口径「有账号直接登录、手机号可以直接登录」）

P2b 落的第一版把「平台手机号授权」当成了唯一入口，结果在开发者工具里表现为**一进来就被拦在门外**：游客 appid 拿不到授权码 → 后端 422 → 首页出「先授权手机号」闸门 → 点「去授权」又是同一条死路；网页端注册过的老账号（含 `admin1@qq.com`）在小程序里反而进不去。§6.1 早就把手机号做成了登录凭据，这一版把它用起来：

| 位置 | 改动 |
|---|---|
| `pages/login/index.jsx` | 账号（手机号/邮箱/用户名）+ 密码为主路径，`POST /api/login` 直接换 Bearer；「微信授权手机号登录」降到分隔线下的次级按钮；新增「还没有账号？注册」 |
| `utils/auth.js` | `loginWithPassword()` 走 `rawRequest`（此刻没有令牌，也不能走会先静默登录的 `request`）；密码登录成功后 `try { bindWechatIdentity() } catch {}` —— 绑不上只影响下次免登录，不挡本次会话 |
| `pages/register/`（新增一屏，14 → 15 屏） | 字段与校验**照 H5 一套**：用户名/邮箱/密码/手机号 + 买家/商家切换 + 商家必填门店名称与地址、可带定位坐标；校验规则从 `frontend/src/stores/profileStore.js` 与 `Register.jsx` 移植进 `utils/validate.js`（决策 8：各端一份，文案与后端 `services/member_service.go` 同口径） |
| `api/index.js` 的 `registerAccount` | 从 `request.post` 换成 `rawRequest`：注册时既没有令牌也还没绑手机号，走原路径会在 `ensureSession()` 那一步直接抛 `NeedsPhoneAuth`，注册请求根本发不出去 |
| 六处闸门 | 首页/门店/购物车/订单/地址/我的 由「去授权」统一改为「去登录」，文案不再暗示必须有平台授权 |
| 后端 | **零改动**：`/api/login`、`/api/register` 已在 `csrfExemptPaths`，登录响应本来就回 `{token, token_type}`，手机号登录在 P2-0 就通了 |

注册成功用 `Taro.reLaunch('/pages/login/index?account=<邮箱>')` 而不是 `redirectTo`：登录成功本来就会 reLaunch 到首页，留半条返回栈只会让人退回一个已无意义的注册页。

**未登录态口径（本轮一并确认）**：小程序**不开放匿名浏览**，也不为小程序放宽后端鉴权范围——受限屏一律走登录闸门。（2026-09-26 的 §6.3 把「闸门」升级成了「传输层直接跳登录页」，闸门留作兜底。）

### 6.3 未登录直接交给登录页 + 登录时按定位落店（2026-09-26，用户口径「小程序怎么还不能浏览」→ 选定「未登录跳登录页」「门店按定位最近营业店」）

§6.2 之后仍要人**在闸门上再点一次**才进登录页，而「没有身份」在这套后端里等价于「没有门店」——`/shop/*` 全部挂在 protected 组内，任何一屏都拉不到数据。既然这一屏不可能有别的出路，就不该留一屏等人点。落地分两层：**登录页当 `pages[0]`**（未登录的人根本看不到商城屏，也就没有带 tabBar 的空壳），**传输层兜底**（会话中途令牌失效时整端跳）：

| 位置 | 改动 |
|---|---|
| `utils/request.js` | 拆出 `sendOnce()`，`send()` 在它抛 `NeedsPhoneAuth` 时统一 `Taro.reLaunch('/pages/login/index')`；`toLoginPending` 标志挡住并发请求的重复跳转。**免跳名单** `NO_JUMP_ROUTES`：登录页、注册页（跳自己没意义）＋ **支付结果页**（那一屏显示的是钱到没到账，弹走人就再也回不来这笔结论了） |
| `utils/shop.js` | 新增 `locate()` 与 `alignStoreByLocation()`：取一次定位 → `GET /shop/stores/nearby` 带坐标 → 取列表里**第一条 `status=open`** 的门店（即最近营业店）→ 与当前店相同则不动，否则 `PUT /shop/stores/selection` 切过去并回门店名 |
| `pages/login` 的 `enterApp()` | 登录成功那一次调用落店（切了店才 toast「已切到 X」），随后照旧 reLaunch 首页。**只此一次**：此后改店只有两条路——门店页显式切店、跨店加购时 `ensureStore` 对齐到商品所属门店（§9.1 第 6 条） |
| `app.config.js` | **登录页提到 `pages[0]`**：小程序的冷启动首页就是登录页，未登录的人不会先看到带 tabBar 的空商城（用户口径「没登录不应该看到 tabbar，应该在登录页」）。tabBar 五项不变，`pages/home/index` 仍是第一个 tab |
| `pages/login/index.jsx` | 这一屏自己承担冷启动判定：`useEffect` 里 `ensureSession()` → 成功即 `reLaunch` 首页（绑过的微信无感进入），失败才露表单；等待期间只出一行「正在登录…」占位 |
| `app.js` | **删掉 `useLaunch` 里的 `ensureSession()`**：静默登录放在启动阶段等于在 app launch 完成前调路由 API（微信会拒），改由登录页发起 |
| `utils/auth.js` + `pages/profile` | `signOut()` 除清令牌外记 `fm_signed_out`，登录页见到该标记就跳过静默登录（否则刚退出就被原样送回首页，退出等于没退出）；手动登录成功在 `enterApp()` 里清掉。「退出登录」改为 `reLaunch` 登录页 |
| 六处闸门 | 由主路径降级为**兜底**（跳转在途或免跳名单内时仍要有一屏可看），文案不变；按钮从各屏自写的 `Taro.navigateTo` 改为统一调 `request.gotoLogin()`（同一套 `reLaunch` + 防重入 + 免跳名单，不再有两套跳法） |
| `app.js` | 冷启动注释同步：静默登录失败不再指望首页出授权入口，改由请求层跳登录页 |
| 后端 | **零改动**：`ResolveStore`（`services/shop_store.go:191`）本来就按会员坐标回落最近营业门店，本轮只是让客户端在登录那一次主动把坐标与选择写进去 |

为什么不放开游客浏览：门店是数据边界（商品、购物车、订单全按门店独立），游客态要么显示一家与位置无关的店、要么整屏空，两种都会误导下单；而 §10 决策 8 之下后端不为单端开鉴权特例。

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
| **P2-0** ✅ | 手机号：中国大陆校验 + `FindByAccount` 支持手机号 + H5 登录/注册文案 + seed 号段 | 1 | H5 用手机号+密码能登录；旧 `60` 号段注册被拒且提示明确 —— **2026-09-22 完成**：实测 `+86 139 1234 1375` 注册归一为 `13912341375`，纯数字/`+86` 带空格/邮箱/用户名四种凭据均可登录，同号重复注册 409，`60` 号段 400，SSO `admin/admin123` 与资料页 3-4-4 展示不回归 |
| **P2a** ✅ | 端标识 + CSRF 分流 + openid 服务端解析 | 1.5 | Bearer 写接口全通；H5 三条主流程零回归 —— **2026-09-22 完成**：仅 Bearer 的「加购→下单→prepay→launch→mock-notify→query」全 200 且收敛 `success`；Cookie 路径缺/错 CSRF 头仍 403、正确则 200；Bearer+Cookie 并存按 Cookie 处理（403，未放宽）；`?openid=` 客户端自报已从代码里清除 |
| **P2b** ✅ | 小程序登录 + 手机号授权合并 + 索引（身份换取支持确定性 mock） | 2 | 小程序登录 → `/api/auth/me` 与 H5 同一 member —— **2026-09-23 完成**：28 条断言全通过（合并拿同一 `member_id`、H5 建的地址小程序读到、未授权 422 不发令牌、同 openid 绑二号 409、注入 `openid`/`member_id` 不参与、Cookie 路径 CSRF 未放宽、三条 unique+sparse 索引已建且存量 4 会员未受影响）；`bind` 契约由 `{target, verify}` 改为 `{code}`，`alipay/login` 挪 P2f，见 §3.2 落地记录 |
| P2c | 支付形态：小程序 appid 位 + `tradeno` kind + mock 分流 | 2 | 双端 IDE 里 mock 走完并收敛为 paid，重复确认不双结算 —— **2026-09-23 mock 与 appid 位完成**：`WechatParams.MiniAppID`（`WX_MP_APP_ID`）按端选 appid、`mockLaunch` 按 `X-Client` 分流（小程序回 `qrcode` 挂起、H5 仍 `redirect`）、渠道与端不匹配在**建单与唤起两处都拒**（§12 末行）。**`tradeno` kind 随 P2f 一起做**（缺的是支付宝小程序应用的密钥与 `trade.create` 报文，现在只能落空壳）；JSAPI 真实签名待 P2g 商户资质 |
| **P2d-1** ✅ | 工程骨架 + `theme/tokens` 手写样式体系 + `request.js` + `useRequest` | 2 | 一端编译出包，首页能拉到真实接口数据 —— **2026-09-23 完成**：`miniprogram/` 独立工程落地（自带 `package.json`，工程外零依赖），weapp 与 alipay 两个 target 均编译通过（产物 396K / 主包上限 2M），`api/index.js` 整文件移植后仅改素材补全与上传两处，16 条流程自测全通过。细节见 §12 与 `miniprogram/README.md` |
| **P2d-2** ✅ | 买家 14 屏移植（原 11 屏 + 支付结果页 + 订单详情页 + 收藏页） | 8 | 微信真机走通「浏览 → 加购 → 结算 → mock 支付 → 订单」—— **2026-09-23 代码与流程自测完成**：14 屏全部落地并接入 `app.config.js`（含原生 tabBar 五入口）、双端 `taro build` 通过、`oxlint` 0/0、41 + 18 条接口级流程自测全绿（§12 末两行矩阵）。**待用户在开发者工具/真机看视觉与授权按钮行为** |
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
3. **闸门**：`/usr/local/go/bin/gofmt -l .`、`go build ./...`、`go vet ./...`、`npx oxlint src`（0/0）、`npm run build`、`swag init`，小程序侧另加两端 IDE 的真机预览。**小程序编译闸门走 `npm run preview:weapp` / `preview:alipay`**（一次性 dev 构建、产物正确）；`build:*` 是正式包专用，缺 `FM_API_BASE` 会在构建期以退出码 1 停下 —— 那是 2026-09-23 起的行为，别把它当成编译失败。
4. ⚠️ 本地库有真实数据时**禁止 `seed`**（会 drop 全部集合）；自测产生的测试账号/门店测完即删，并核对删除范围只含本次新建的 `_id`。
5. **报错口径（每端各自实现，规则必须一致）**：某一屏的某块内容拉取失败时，屏上已有内容就留着继续用，不在内容上叠红条；只有这一块什么都没有时才出「加载失败，请重试 + 重试」。例外是结算试算与支付结果——金额和支付结论不能凭空显示。移植新页面时按这条写，别照抄「有 error 就整页替换」的写法。
6. **加购必带门店（每端各自实现，规则必须一致）**：列表/详情接口都回 `store_id`，加购前先按它对齐门店——不一致就先 `PUT /api/shop/stores/selection` 切过去再下车（H5 `useEnsureStore`、小程序 `utils/shop.ensureStore`），并明确告诉用户「已切到某店，购物车与下单都按这家」。**门店数据独立、一单一店是硬约束**：批量加购（收藏一键加购）里出现多家门店直接拒并说明，绝不静默拆成多批；跨门店下单由服务端 `mergeLine` 的 422 兜底，但那只用于挡住绕过对齐的请求。移植新页面时按这条写。
7. **未登录不留在屏上等人点（小程序已落地，2026-09-26）**：请求层一识别出「没有身份」就整端跳登录页，页面级「去登录」只作兜底；**支付结果类屏一律不跳**（结论不能被人弹走），登录/注册自身也不跳。登录成功那一次按定位落**最近营业中门店**，之后除显式切店与跨店加购对齐外不再自动改店。新页面不得自行加「游客可浏览」分支——后端 `/shop/*` 全在鉴权组内，放宽不在本方案范围。**H5 侧同两条规则尚未对照实施**（H5 靠 `PrivateRoute` 跳 `/login`，落店仍由服务端 `ResolveStore` 兜底），要不要跟进由用户决定。

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
| 8 | 前端是否共用工程（2026-09-23 追加拍板） | **不共用**：小程序与 H5 各自独立工程、独立构建、独立部署，后来的 App 同理；不做 workspace / 跨目录 import / 共享 npm 包，公共代码一律**移植（拷贝）**过去 | §2 抬头更正、§4 部署边界 |

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
| 2026-09-22（当日） | **P2-0 完成并推 `feat/miniprogram-p2`**：手机号改为中国大陆校验（`^1[3-9]\d{9}$`）+ `NormalizeMobile` 统一「校验/查重/入库/登录比对」四处口径（否则 `+86…` 与纯数字会绕过唯一索引变成两个账号，直接打在 §6 的合并主键上）；`FindByAccount` 支持手机号登录；H5 登录页文案与资料页 3-4-4 展示、注册页文案、seed 号段同步。实测四种凭据可登录、同号重复注册 409、`60` 号段 400。 |
| 2026-09-22（当日） | **P2a 完成**：① CSRF 按凭证载体分流 —— `middleware/jwt.go` 的 `extractToken` 回载体并导出 `TokenCarrier(c)`，`middleware/csrf.go` 对 bearer 放行；**落地时修正本文原方案**：CSRF 是全局中间件、跑在 JWT 之前，读不到鉴权写的 context key，故判定做成不依赖顺序的纯函数。② `LaunchEnv.Client` + `X-Client` 头（非法值回落 h5），`wechat.go` 的 JSAPI 分支改由端标识强制；CORS 允许头补 `X-Client`。③ 删掉 `OpenID: ctx.Query("openid")`，换成 `PayerFunc` 注入 + `controllers.MemberPayer` 查库；`models.Member` 的 `WxOpenID`/`AlipayUserID` 两列从 P2b 提前（`json:"-"`），`WxUnionID` 与唯一索引仍留 P2b。自测矩阵见 §3.1，测试数据（2 个临时会员 + 3 单 2 支付单 1 地址 2 购物车）已按 ID 删除并回补商品 `stock/sales`。 |
| 2026-09-23 | **P2b 完成**：小程序授权登录与手机号合并打通。① `services/mp_settings.go` + `services/mp_auth_service.go`：`code2session` → openid → 命中即签发，未命中按平台授权手机号合并或新建买家账号；`/api/miniprogram/wechat/login`（免 CSRF）与 `/api/miniprogram/bind`（Bearer 过 CSRF）两条路由，出参复用 `models.LoginResponse`。② mock 只替换「换取身份」的响应报文（`mpWechatFetch` 一处），合并与签发与真实渠道同一份代码；密钥只从 `WX_MP_APP_ID`/`WX_MP_APP_SECRET` 进，缺省含 `MOCK`，`session_key` 不接进进程、错误不带渠道原文（URL 里有 appsecret）。③ `models.Member.WxUnionID` + `members` 上 `wx_openid`/`wx_unionid`/`alipay_user_id` 三条 unique+sparse 索引，存量会员无这些字段因稀疏而被跳过，实测不受影响。④ 与本文原设计两处偏差：`bind` 只收 `{code}`（客户端自报 openid 等于允许挂别人的收款身份）、`alipay/login` 挪到 P2f（缺的是那一套小程序应用密钥与 RSA2 底座，本阶段只能交空壳）；细节与 28 条验收矩阵见 §3.2 落地记录。自测数据（3 个临时会员 + 1 条地址）已按 ID 删除。 |
| 2026-09-23 | **P2d-1 完成（小程序工程真的开工了）**：按决策 8 建 `miniprogram/` 独立工程（Taro 4.2.1 + React 18，自带 `package.json`/`config/`/`project.config.json`，`outputRoot` 按端分 `dist/weapp`、`dist/alipay`），**工程外零依赖**。① `theme/tokens.scss` 落地色值唯一来源（从 `frontend/src` 实到的 74 个色值里取高频的 15 个），`designWidth: 750` 让源码写 px 编译成 rpx，数值即「H5 的 2 倍」。② `utils/request.js` 换成 `Taro.request` 但保持 axios 形状（`get(url,{params})` / `delete(url,{data})`），`api/index.js` 因此能整文件移植；Bearer 免 CSRF、`X-Client` 按 `TARO_ENV` 出 `mp_wechat`/`mp_alipay`、401 清令牌静默重登一次后重放、并发共用同一次登录。③ `hooks/useRequest.js`：竞态丢弃 + `loading/error/data` + `refresh`，不引 react-query。④ **移植时三处必须改端能力**：素材是 `/uploads/xxx` 相对路径 → `absAsset()` 补全（对象存储仍是 §7 硬前置）；没有 `FormData` → 上传走 `Taro.uploadFile`，入参变临时路径；凭证载体从 Cookie 换 Bearer。⑤ **发现并规避一个 mock 环境的死循环**：`wx.login` 每次冷启动给新 code，而模拟渠道按 code 派生 openid → 同一手机号第二次登录必判 409「已绑定其他微信」；开发环境的模拟授权改用持久化的固定 dev code，真实链路的正解是密码登录后 `POST /api/miniprogram/bind`（自测第 10~13 条把这条恢复路径整条验通）。⑥ 安装时需要补 `@babel/preset-react`（`babel-preset-taro` 的隐式 peer，模板没列）。实测：`taro build --type weapp` / `--type alipay` 双端编译通过、产物 396K、`oxlint src` 0/0、16 条流程自测全绿（422→授权→首页→分页→409→bind→静默登录→购物车/收藏写）。**未做**：支付唤起属 P2c；首页与登录页的真机视觉与授权按钮行为待用户在开发者工具里看。 |
| 2026-09-23 | **H5 两处缺陷修复 + 前端工程边界重定（用户拍板，本文原方案作废一处）**：① 支付结果面板「查看订单后返回又重弹」——改为**只到终态才弹 + 按支付单记账只弹一次**（`sessionStorage` 标记），并给 `ResultSheet` 加可选 `onClose`/「稍后再看」，关掉后出路降级为页面内按钮；`Checkout` 同步引入 `paid = success || closed`，已支付订单的按钮不再允许二次预下单。② 收藏「一键加入购物车」后同时移出收藏（加购成功但取消收藏失败只提示，不误报加购失败）。③ **用户新增第 8 项决策**：小程序与 H5（及后来的 App）**各自独立工程、独立构建、独立部署**，不做 workspace / 跨目录 import / 共享 npm 包 —— 本文原「`@common → ../frontend/src` 共享源码」的写法作废，§2 抬头、§2.1、§4 工程树与新增「部署边界」段落均已改为**移植（拷贝）**口径；连带后果写进 §2：同一处缺陷要在各端各改一次（本轮 ① ② 即为例）。④ **进度质询的如实答复**：昨日 P2 交付的是后端前置（P2-0/P2a/P2b），`miniprogram/` 目录当时并不存在，P2c/P2d 未开工；本节修正架构口径后立即开 P2d-1。 |
| 2026-09-23 | **P2c（mock 与 appid 位）后端完成**：① `payment/settings.go` 的 `WechatParams` 加 `MiniAppID`（`WX_MP_APP_ID`），`wechatAppIDOf(client)` 按发起端选 appid —— 微信小程序里 JSAPI 用小程序 appid，微信内置浏览器 H5 仍用公众号 appid，商户号/APIv3 Key/证书三端共用不变。② `mockLaunch` 按 `env.Client` 分流：小程序回 `kind=qrcode`（挂起语义，前端只轮询不跳转），H5 仍回 `redirect`，**H5 路径零改动**。③ 新增「渠道必须与发起端匹配」的服务端硬校验（`providerAllowedForClient`）：`mp_wechat` 只收 `wechat`、`mp_alipay` 只收 `alipay`，`h5`/`app` 两渠道都放行；建单（`prepay`）与唤起（`Service.Launch`）两处都拦 —— 原方案只靠前端 `providers.js` 裁剪渠道列表，改包就能建出一笔本端唤不起来的 pending 单。④ 自测：`gofmt`/`go build ./...`/`go vet ./payment`/`swag init` 全过；小程序形状 41 条断言全绿（含「跨端建单 422」「换端唤起 422」「模拟回调后轮询收敛 `success`、订单转 paid」「重复 prepay 复用同一 pending 单」「取消后不可再支付且库存回滚」），H5 回归另测 4 条（`X-Client: h5` 与缺省两种头下 alipay/wechat 均 200、launch 仍回 `redirect`）。⑤ **`tradeno` kind 与支付宝 `trade.create` 挪 P2f**，真实渠道签名待 P2g。自测数据（3 个临时会员、10 单 12 支付单 5 地址 2 购物车）已按 `_id` 删除，并回补被已支付自测单占用的 `stock/sales`（苹果 +6 / −6）。 |
| 2026-09-23 | **P2c-2 + P2d-2：小程序支付模块与买家 13 屏全部落地**（回答「支付为什么还没接」——本轮接完，且是真链路不是假页面）。① `miniprogram/src/payment/`：`api.js`（prepay/query/launch/mock-notify/isMockPayment）、`launch.js`（`applyLaunch`：`jsapi`→`Taro.requestPayment`、`qrcode`→`'pending'` 交轮询、`form`/`redirect` 在小程序是**协议错误**直接抛）、`providers.js`（渠道按端裁剪，注释点明服务端同样会拒）、`usePaymentStatus.js`（3s 轮询、终态判定、`paymentSecondsLeft` 倒计时）、`components/PaymentSheet.jsx`（模拟渠道的确认层只投回执，**成功与否一律等轮询**）。② 13 屏：首页/类目/购物车/订单/我的 + 登录/商品详情/搜索/结算/支付结果/订单详情/地址/附近门店；`app.config.js` 五 tab 纯文字（图形待设计交付）。③ **修好上一轮留下的编译断裂**：`PaymentSheet.jsx` 在 `components/` 下却用 `./api`、`./launch` 引同目录（ webpack 只 warn 不 error，端上表现为运行时报错）→ 改 `../`，`moneyLabel` 回到 `../../api`；补 `pages/address/pick.js`（结算页与地址页之间用 storage 交接选中项，`navigateBack` 带不了返回值）；`checkout` 的试算从渲染期取数挪进 `useEffect([selection, addressId])`。④ **立即购买不再误下整辆车**：详情页加购后把该行数量改成当前选择、带 `?items=<行id>` 进结算，结算只勾这几行。⑤ 反闪屏统一：切 tab/切类目/搜索只把上一批数据压暗（`opacity .5`）+ `seq` 丢弃过期响应，骨架屏只在首帧。⑥ 内容宽度算过：屏 750 − 左右 60 = 630，卡片宽从 320 改 306（320 时「两列」其实是一列）。⑦ 闸门：`oxlint src` 0/0、`taro build --type weapp` 与 `--type alipay` 双端通过、`enablePullDownRefresh` 与页面实际用到的下拉刷新逐页核对。⑧ **待用户看**：两端 IDE 真机预览的视觉与授权按钮；商家发品属 P2e。 |
| 2026-09-23 | **收藏页补齐（第一批从 13 屏变 14 屏）+ 后端扩展性预案落纸面**。① `pages/favorites/`（+ `index.config.js`/`index.scss`，登记进 `app.config.js`，「我的」页加「我的收藏」入口）：列表就是 `/shop/products?favorite=true`、行间搜索再叠一个 `q`，分页沿用压暗 + `seq` 丢弃；**一键加购成功后这批同时移出收藏**（移出失败只提示、不误报加购失败，与 H5 同口径），售罄行不给勾（服务端确认含售罄行的批量加购整批被拒，故不给勾不是装饰）。② 修掉一个自己写出来的优先级 bug：`sum + (...).priceValue || 0` 会让合计从第二个选中项起恒为 0。③ 自测 18 条接口级断言全绿（授权登录 → 收藏三个商品（含有货 2 + 售罄 1）→ `favorite=true` 只回收藏且带 `collected`/`price`/`stock` → 收藏内搜索与空结果 → 批量加购 + 移出这批 + 售罄行留下 → 含售罄整批被拒 → 行尾单个取消 → 清空后走空态 → 未登录取收藏列表 401）；闸门 `oxlint src` 0/0、`build:weapp`/`build:alipay` 双端通过且构建日志逐条读无 warning；自测账号（`mock-openid-*`、派生号 13486507466）按 `_id` 清理，库存/销量未受影响（本流程不涉订单），四个种子账号完好。④ 新增 **`docs/backend-scalability.md`**（回答「后端要预留扩展、考虑并发过大/雪崩熔断/后续微服务，代码暂不动但有些节点提前归化」）：17 条现状事实（全带 `文件:行`）、风险按「错了会怎样」分级、**11 个归化节点 N1~N11**（只改形状不改行为的那批：ctx 贯通、出网口收口、幂等键 + 唯一索引、条件写口径、outbox 雏形、依赖显式化、读路径去副作用、优雅停机、可观测最小面、数据归属表、素材外置）、S0~S3 分期与触发阈值、熔断/限流/超时统一口径、六个域的拆分顺序，以及 5 个待用户拍板点。核心判断：**幂等（N3）必须先于熔断与重试**，否则超时兜底与半开探针会重复扣券/重复建单。 |

| 2026-09-23 | **报错口径统一：屏上有内容就不报红（H5 与小程序各改一遍）**。① 现象（用户截图）：H5 首页叠了四条「加载失败，请重试 / 网络错误，请稍后重试」，而下方的类目与商品其实早就渲染好了——react-query 在 v5 里「带着旧数据重取失败」也会把 `isError` 翻成 true，于是网络抖动或后端重启一次就把好数据盖成红条。② 规则落到 10 处 H5（`Shop` 三处 + `Category`/`Detail`/`Search`/`Favorites`/`MyOrder`/`MyVoucher`/`StoreSwitcher`）与小程序 11 屏（本轮新加 6 屏：`stores`/`product`/`order-detail`/`address`/`cart`/`profile`；此前已符合的 5 屏：`home`/`favorites`/`search`/`category`/`orders`）：报错块只在**这一块什么都没有**时渲染，旧数据继续用，重进页面或下拉刷新自愈。③ 两处刻意保留：`Checkout` 试算失败仍挡住金额（不能凭空显示要付的钱），`payment-result` 的失败就是支付结论本身；中台列表页也保留（商家要照着屏幕上的数据做发货/改价，宁可见红条不可见旧数据）。④ 顺带修掉一个真实缺陷：`useVouchers` 把 `fetchVouchers` 直接当 `queryFn`，react-query 的查询上下文被当成金额入参，请求被打成 `/api/vouchers?amount[client]=…&amount[signal]=…`；改 `() => fetchVouchers()`，浏览器实测券列表正常。⑤ 自测（不写单测，走真实链路）：本地把 8080 后端停掉制造 502，`/shop` 五块内容全部重取失败后红条数 0、商品与类目仍在；同页只清空类目缓存则恰好出 1 条红条（说明是逐块判定不是全局静默）；`/vouchers` 无数据 + error 时红条照常出。⑥ 闸门：`oxlint`（前端、小程序各 0/0）、`vite build`、`build:weapp`/`build:alipay` 双端编译通过。⑦ 规则同时写进本文 §9.1 第 5 条与 `docs/product-prototype.md` §5，后续每端移植新页面按此实现。 |
| 2026-09-23 | **跨门店加购改为自动切店（用户口径「门店数据独立、不能跨门店下单」，H5 与小程序各改一遍）**。① 后端：`ProductCard` 与 `ProductDetail` 加 `store_id`（`models/shop.go`，`CardView()` 一处带出），`shop_service.Detail()` 同步回填——收藏这类「跟人走」的列表（`ListProducts` 在 `FavoriteOnly` 时清掉门店范围）此前拿不到归属门店，前端无从判断。`cart_service.mergeLine` 的跨店 422 **保留不动**，语义从「正常报错」降级为「兜底」：注释改口径说明走到这里说明请求绕过了端上对齐。② H5：新增 `hooks/useEnsureStore.js`（比对当前门店 → `select` → `invalidateQueries()` → 重载购物车，返回 `{storeId, storeName}` 或 `null`），`useAddToCart` 改为先对齐再下车并回 `{data, switched}`（原调用方丢弃返回值，改形状安全）；`Favorites` 给跨店行打门店名标签（门店名从 `nearby` 全量列表本地解析，没有为此加 `store_name` 字段）、`addSelected` 先拒混店再切店；`Detail` 加购后在按钮下方出 `role="status"` 的切店说明，且用「状态里存 productId」代替 `useEffect` 重置以避开 `set-state-in-effect`。③ 小程序：新增 `utils/shop.js`（模块级门店快照 + `ensureStore`/`switchStore`），`category`/`product`/`favorites` 三屏加购前对齐门店、切店提示并入 toast，`buyNow` 也对齐（跳结算故不出提示），`stores` 改用 `switchStore` 以免快照失效。④ 自测（真实浏览器 + 真实库，不写单测）：跨店收藏行正确标注「自测二号店」→ 一键加购(2) 出「已切换到…」并购物车恰好这 2 行、剩余行改标「FreshMart 旗舰店」→ 混店选择被拒且**零写入、当前门店未变**→ 单行跨店切回 store-1 → 详情页加购出切店说明 → 切店后 `/shop` 首页各块为空（证门店数据独立）；全程 0 条「加载失败」。闸门：`gofmt`/`go build ./...`/`go vet ./...`/`swag init` 全过，前后端 `oxlint` 各 0/0、`vite build` ✓、`build:weapp` ✓、`build:alipay` ✓。自测数据按 `_id` 清理并回补收藏（含原 `created_at`），收尾核对 `default_store=store-1`、收藏 6 条、购物车 11 行、`test-xstore*` 残留 0。⑤ 规则写进 §9.1 第 6 条与 `docs/product-prototype.md` §5、`docs/api.md`（ProductCard 字段表 + 批量加购「整批只能是一家门店」）。**待用户看**：小程序两端 IDE 的真机表现。 |
| 2026-09-24 | **修掉「小程序一打开就是接口地址未配置」**（用户在开发者工具里的截图）。① 根因不是代码：`build:weapp` 走 `NODE_ENV=production` 分支，缺 `FM_API_BASE` 时 `__API_BASE__` 被注入成空串，包能编出来、跑起来才在首页报「接口地址未配置，构建时需要 FM_API_BASE」——而本地预览恰恰只有这一条命令可用（`dev:weapp` 是 watch，得一直挂着终端）。② 改成**构建期就停下**：`config/index.js` 在非 development 且缺 `FM_API_BASE` 时打印三条可用命令并 `process.exit(1)`。落地时踩到一个坑：原先在 `config/prod.js` 里 `throw`，被 Taro 的配置文件加载兜底吞掉，表现为「找不到项目配置文件config/index，请确定当前目录是 Taro 项目根目录!」——完全指错方向，故判定挪到 `config/index.js` 用退出码拦停（实测 exit=1、消息完整）。③ **补上缺的那一档**：`preview:weapp` / `preview:alipay`（一次性 development 构建，编完退出，产物直接给开发者工具打开），`dev:*` 两条同时显式带 `NODE_ENV=development`，不再依赖 CLI 对 `--watch` 的隐式推断。④ 运行时的兜底文案改成可执行的下一步（`本地预览跑 npm run preview:weapp，正式构建要带 FM_API_BASE`）。⑤ 文档：`miniprogram/README.md` 与根 `README.md` 的启动段改为三档（watch / 一次性预览 / 正式包），域名校验一行补真机口径（换局域网地址 + 手机端开调试模式，`FM_API_BASE` 覆盖即可，不必为本地预览备案）；§9.1 第 3 条闸门同步改为「小程序编译闸门走 `preview:*`」。⑥ 自测：`preview:weapp`/`preview:alipay` 双端产物内 grep 到 `http://localhost:8080`，且「接口地址未配置」那段死代码被摇掉（证明常量真的注入了）；`build:weapp` 缺 base → exit 1 + 三条命令；`FM_API_BASE=https://api.example.com build:weapp` → exit 0、产物注入该域名、无告警；`oxlint src` 0/0。⑦ **记录一条非缺陷**：dev 构建会打一条内容为 `== '"production"'` 的 webpack 告警，双端一致，`@tarojs/*` 与业务源码里都搜不到这段文本（Taro 4.2.1 dev 模式自带），prod 构建无此告警、产物已核对，不影响功能。 |
| 2026-09-26 | **P2b-2：小程序登录改为「账号密码为主路径」+ 注册页移植**（用户在开发者工具里截图质问「这是什么情况 没有账号要在应用页面 有账号直接登录页面 手机号可以直接登录的」）。① 根因：P2b 第一版把平台手机号授权当成唯一入口，游客 appid 拿不到授权码 → 后端 422 → 首页闸门「先授权手机号」→ 点进去还是同一条死路；网页端已有的账号在小程序里反而进不去。② `pages/login/index.jsx` 改为账号（手机号/邮箱/用户名任一）+ 密码，走 `POST /api/login` 拿 Bearer；「微信授权手机号登录」降到分隔线下次级按钮；开发环境的「模拟授权」块保留。③ 新增 `utils/validate.js`（从 `frontend/src/stores/profileStore.js` + `Register.jsx` 移植，文案与 `services/member_service.go` 同口径）与 `loginWithPassword()`；密码登录后 `try { bindWechatIdentity() } catch {}`，**绑不上不挡本次会话**。④ 新增 `pages/register/`（14 → 15 屏，双端登记）：字段照 H5 一套（用户名/邮箱/密码/手机号 + 买家/商家切换 + 商家必填门店名称/地址、可带 `Taro.getLocation` 坐标），成功后 `reLaunch('/pages/login/index?account=<邮箱>')`。⑤ **修掉一个会让注册根本发不出去的坑**：`api/index.js` 的 `registerAccount` 原走 `request.post`，而 `request` 每次调用前先 `ensureSession()`，未绑手机号时那一步直接抛 `NeedsPhoneAuth` → 注册/登录这类无身份调用一律改走 `rawRequest`（文件头把「因端能力而异」从两处更正为三处）。⑥ 六处闸门（首页/门店/购物车/订单/地址/我的）由「去授权」统一改「去登录」，文案不再暗示必须有平台授权；未登录口径按本轮确认落定：**不开放匿名浏览、不为小程序放宽后端鉴权**。⑦ 文档：本文 §6 流程图重画（静默登录 → 密码主路径 → 授权次级 → 注册）、`account_type` 口径同步（小程序注册也能选商家）、新增 §6.2；`miniprogram/README.md` 目录/限制表同步。⑧ 闸门：`oxlint src` 0/0、`preview:weapp` 与 `preview:alipay` 双端编译通过且产物核对（`app.json` 15 屏含 register、`pages/register/index.js` 有 `pill--on`、登录页保留 `dev__label` 与 `getPhoneNumber`）。**后端零改动**（`/api/login`、`/api/register` 本就在 CSRF 豁免清单且回 `token`）。⑨ **真实流程自测（Docker 重启后补跑，全绿）**：注册买家 201 → **手机号 + 密码登录 200**（邮箱、用户名两种凭据同样 200）→ 带 Bearer 取 `/shop/home` 200 且自动落到 `store-1` → 密码登录后 `POST /miniprogram/bind` 200 → 同 code 静默登录直接命中该会员 200 → 平台手机号授权走同号码也合并到**同一个 member_id** 200 → 次级按钮这条路不产生新账号。商家侧：注册带门店字段 201 且回 `owned_store_id`、`/profile` 显示 `account_type=merchant` 与 `default_store_id`、附近门店按距离排到新建店 0 米；缺门店字段 400 且文案与 `utils/validate.js` 完全一致（`门店名称需 2-30 个字符`）；重复手机号 409、`60` 号段 400。未绑定 code 静默登录仍回 422（客户端出「去登录」闸门）。自测数据（2 会员 + 1 门店）按显式 `_id` 删除，核对 `members` 回到 5 条种子账号、`stores` 只剩 `store-1`、`carts`/`addresses` 未动、关联集合残留 0。⑩ **顺带记录一条既有后端行为（非本轮引入）**：`bind` 允许同一会员改绑到第二个 openid（最后一次生效），409 只挡「同一 openid 属于别的会员」——密码登录在多台设备各自 bind 时表现为换绑而非冲突，不影响账号归属正确性（操作者本就是该会员）。 |
| 2026-09-26 | **P2b-3：未登录整端跳登录页 + 登录时按定位落最近营业店**（用户追问「小程序怎么还不能浏览」，两点口径经确认落定：不开放游客浏览、改由传输层直接跳；门店按「定位最近营业店」）。① `utils/request.js` 拆 `sendOnce`/`send`，`send` 捕获 `NeedsPhoneAuth` 后 `Taro.reLaunch('/pages/login/index')`，`toLoginPending` 挡并发重复跳；免跳名单三屏 = 登录/注册（跳自己无意义）+ **支付结果页**（弹走就回不来这笔钱的结论）。六处闸门降级为兜底，`app.js` 冷启动注释同步。② `utils/shop.js` 新增 `locate()` + `alignStoreByLocation()`：nearby 带坐标 → 取第一条 `status=open` → 非当前店才 `PUT /shop/stores/selection`，登录成功那一次调用一次，此后不自动改店。③ **后端零改动**（`ResolveStore` 本就按坐标回落最近营业店）。④ 自测（真实接口 + 真实库，不写单测）：无坐标新账号 `/shop/home` 回落 `store-1`（第一家营业店）→ `nearby(121.47,31.23)` 把 1463 米的测试店排在 374 万米的 `store-1` 之前且 `current=false`（端上据此判定要切）→ `PUT selection` 200 回 `store_id=测试店` → **`/shop/home` 的 `store` 变为该最近营业店**、会员坐标持久化为 `121.47,31.23`；未登录取 `/shop/home` 仍是 401/422（即 `NeedsPhoneAuth` → 跳转的触发条件），后端鉴权范围未放宽。⑤ 闸门：`oxlint src` 0/0、`preview:weapp` 与 `preview:alipay` 双端编译通过，产物核对 `common.js` 内含免跳名单与 `stores/selection` 调用（仅剩已记录的 Taro dev 告警）。⑥ 文档：本文 §6 流程图补落店一步、新增 §6.3；`miniprogram/README.md` 补 `utils/shop.js` 一行、「未登录态」行改写、新增「首次落店」行。自测数据（3 会员 + 1 门店）按字符串 `_id` 删除，核对 `members` 回到 5 条种子、`stores` 只剩 `store-1`、全集合残留 0。 |
| 2026-09-26 | **P2b-4：登录页提为冷启动首页（用户口径「没登录不应该看到 tabbar 的，应该在登录页」）**。上一节的传输层自动跳在真机上不够——未登录的人冷启动仍先见到带 tabBar 的空商城（闸门那一屏本身就是 tab 页），且启动阶段的 `reLaunch` 有被微信拒的风险（用户回报「点去登录没反应」，控制台无红色报错，即路由 API 被拒这一类）。① `app.config.js` 把 `pages/login/index` 提到 `pages[0]`（tabBar 五项与第一个 tab 不变）。② 登录页 `useEffect` 里 `ensureSession()`：成功即 `reLaunch` 首页（绑过的微信无感进入），失败才露表单，等待期出一行占位。③ **`app.js` 删掉 `useLaunch` 中的 `ensureSession()`**——静默登录放在启动阶段等于在 app launch 完成前调路由 API。④ `signOut()` 增记 `fm_signed_out`（否则登录页那一次静默登录会把刚退出的人原样送回首页，退出等于没退出），`enterApp()` 清标记；「退出登录」改为 `reLaunch` 登录页。⑤ 六处闸门按钮从各屏自写的 `Taro.navigateTo` 统一改调 `request.gotoLogin()`（同一套 `reLaunch` + 防重入 + 免跳名单），不再有两套跳法。⑥ 闸门与后端鉴权范围都不动（后端零改动）。⑦ 闸门：`oxlint src` 0/0、`preview:weapp` 与 `preview:alipay` 双端编译通过，产物核对 `dist/{weapp,alipay}/app.json` 的 `pages[0] === pages/login/index` 且登录页不在 tabBar 列表内、`fm_signed_out` 与 `pages/home/index` 均在产物里。⑧ **待用户在开发者工具里看**：冷启动是否直接落在登录页、绑过的微信是否无感进首页、退出后是否停在登录页。 |
| 2026-09-26 | **P2b-5：修「点了登录没反应 / 还是登录不上」**（用户口径「和 H5 保持一致的基础上可手机号登录」）。① **根因一类：不回调的平台 API 把跳转挂在前面**。游客 appid 与隐私协议未通过时 `wx.login`/`wx.getLocation` 可能既不 success 也不 fail，而 `enterApp()` 把「落店（含定位）」和「bind（含 `wx.login`）」都排在 `reLaunch` 首页之前 —— 令牌已经拿到了也进不去，表现就是按钮一直转。落地按「稳定优先」收口：`utils/shop.js` 新增 `withDeadline(promise, ms)`（超时按失败处理），`locate()` 限时 3s、`alignStoreByLocation()` 在登录侧限时 4s、`bindWechatIdentity()` 限时 4s 且**不再 await**（绑不上只影响下次免登录）、登录页冷启动的静默登录限时 3s（超时也要把表单露出来，本地已有令牌则不等网络直接走）。② **根因二类：注册页带过来的账号没解码**。`reLaunch('/pages/login/index?account=' + encodeURIComponent(email))` 里的 `@` 会是 `%40`，微信侧解不解由版本决定（Taro 的 `decodeURIComponent` 在 h5 侧的 query 解析里，weapp 侧不保证）——预填错一位就是「用户名或密码错误」，而用户正是先注册再点登录。登录页改为无条件再过一次 `initialAccount()`（已解码的字符串再解一次不变，含裸 `%` 时 catch 原样返回）。③ **与 H5 对齐**：登录页补上 H5 同一句「测试账号 admin / admin123」提示（`frontend/src/pages/Login.jsx:114`），预填仍按既定决策不做。④ 顺带把 `pages/stores` 与 `pages/register` 各自手写的 `Taro.getLocation` 收口成 `utils/shop.locate()` 一份（同一处缺陷各端各改一次，但同一端内不该有三份）。⑤ 自测（真实接口 + 真实库，不写单测）：`admin/admin123` 200、手机号 `13900002051`+密码 200、邮箱 200、用户名 200 四种凭据同口；未绑身份 code 静默登录 422（表单该露出）；自测注册账号 201 后按 `_id` 删除，并**核对出库里多出的 `admin666@qq.com` 是用户今天手工注册的账号，未删**。⑥ 闸门：`oxlint src` 0/0、`preview:weapp` 与 `preview:alipay` 双端编译通过，产物核对登录页含 `decodeURIComponent` 与提示文案、`common.js` 含定位限时。 |
