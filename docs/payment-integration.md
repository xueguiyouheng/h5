# 生鲜商城（FreshMart）支付接入方案 · v1

> 状态：**当前为 mock 模拟支付，但 mock 只做在「渠道回来的那份报文」这一层**。拼参数、RSA2/V3 签名、HTTP 外呼、报文解析、金额复核、验签、结算全部是真实代码路径；假数据只有网关响应体里的字段值（含 `MOCK` 标记）。
> 因此接入真实渠道 = 注入商户信息 + 把 `PAY_PROVIDER` 改成 `alipay`/`wechat`，**接口契约、状态机与前端流程都不用改**。
> 范围：说明已落地的链路与渠道适配层结构、真实接入的前置条件、以及切换顺序。落地清单见 §11，需要业务方提供的信息集中在 §10。
> 本文与 `docs/api.md` 同一套契约：响应信封、snake_case、金额字符串十进制、Cookie + CSRF（渠道公网回调除外）。
>
> **模块边界**：支付是一套独立模块（后端 `payment/`、前端 `frontend/src/payment/`），不 import `services`/`models`/`config.Pay`；
> 商城通过 `payment.OrderGateway` 把订单信息喂给支付、接收结算回调，会员身份由外层注入的 `payment.MemberFunc` 解析。
> 因此换端（H5 / 小程序 / App）或换商城时，只换外层适配器，支付内部的状态机与渠道适配层不动。

---

## 1. 现状（已实现的链路）

| 步骤 | 动作 | 实现位置 |
|------|------|----------|
| 1 | 结算试算 → 选地址/券 → 提交订单（服务端扣库存、占券、清购物车行） | `POST /api/orders`（已有，未改） |
| 2 | 用订单号 + 支付方式建**支付单**：向渠道预下单拿到收银台素材后才落库 | `POST /api/payment/prepay` → `payment.Provider.Prepay` |
| 3 | 前端拉起**收银台弹层**，展示金额、二维码位、商户标识、倒计时 | `payment/components/PaymentSheet.jsx` |
| 4 | 点「唤起支付」拿一条 **`Launch` 指令**，按 `kind` 把页面送到渠道：支付宝手机网站支付表单 / 微信 H5 跳转 / 微信 JSAPI / 桌面扫码 | `POST /api/payment/launch/{id}` → `payment.Provider.Launch`，执行器 `payment/launch.js` |
| 4b | mock 渠道的唤起指向本站自托管落点，结算后 302 回结果页，骨架与真实渠道的同步跳转一致 | `GET /api/payment/mock/launch` → `Service.MockReturn` |
| 5 | 两条入口汇到同一个 `settle`：条件更新 `pending→success/failed`，再写回订单 | `payment/service.go` → `services.PaymentGateway.Settle` |
| 6 | 页面留在本站时（扫码 / JSAPI）轮询 `GET /api/payment/query/{id}`；被渠道带走的由 `pages/PaymentResult.jsx` 落地后轮询。成功走 `SKh1XGuRfL`，失败走 `q721g3bZFw` | `payment/components/PaymentSheet.jsx`、`pages/PaymentResult.jsx` |

**模块构成**（后端 `payment/`，自成一套错误、金额、Mongo 与配置底座）：

| 文件 | 职责 |
|------|------|
| `payment/provider.go` | `Provider` 接口（`Prepay`/`Launch`/`ParseNotify`/`Query`/`Close`）、渠道注册表、**mock 报文构造** |
| `payment/launch.go` | `Launch` 唤起契约（`form`/`redirect`/`jsapi`/`qrcode`）+ `LaunchEnv`（UA、openid）、UA 判定、mock 唤起拼串 |
| `payment/alipay.go` | 当面付 `alipay.trade.precreate` 预下单、手机网站支付 `alipay.trade.wap.pay` 自提交表单（`Launch`）、`alipay.trade.query` 查单、`alipay.trade.close` 关单、表单回调验签 |
| `payment/wechat.go` | V3 Native `/pay/transactions/native` 下单、H5 `/pay/transactions/h5`、公众号 `/pay/transactions/jsapi`（含给前端的第二段 RSA 签名）、按商户单号查单与关单、`WECHATPAY2-SHA256-RSA2048` 认证头、回调时间戳防重放 + 平台证书验签 + APIv3 Key AEAD 解密 |
| `payment/gateway.go` | `OrderGateway` 接口（`Order`/`Settle`）——支付与订单之间唯一的耦合点 |
| `payment/service.go` | 建单/复用、唤起、状态机、幂等结算、超时惰性关单、主动查单收敛、mock 回跳结算 |
| `payment/http.go` | 路由注册（`RegisterMember`/`RegisterPublic`）与统一响应 |
| `payment/settings.go` | `PAY_PROVIDER` 等环境变量读取（配置项与旧 `config.Pay` 完全一致） |
| `payment/store.go` `money.go` `crypto.go` `client.go` `errors.go` `types.go` | 本模块自用的 Mongo 读写、元↔分换算与币种符号、RSA 签名验签、HTTP 外呼、错误映射、`Payment` 模型 |
| `payment/doc.go` | 模块边界说明：不 import `services`，渠道差异只落在 `provider/alipay/wechat` |
| `services/payment_gateway.go` | `OrderGateway` 的商城实现：读订单快照、把支付结果写回 `orders` |
| `frontend/src/payment/` | `api.js`（prepay / query / launch 三个接口）、`launch.js`（唤起执行器：表单自提交、整页跳转、`WeixinJSBridge`）、`providers.js`（渠道清单，结算页与收银台共用）、`components/PaymentSheet.jsx`、`index.js`（唯一出口） |
| `frontend/src/pages/PaymentResult.jsx` | 被渠道带走后的落地页：读 `?payment_id=` 轮询支付单，成功/失败复用 `components/ResultSheet.jsx` |

其中 `provider.go` / `alipay.go` / `wechat.go` 是渠道适配层：真实请求已就位，mock 只替换响应体。

**故意没做的事**：退款、对账、独立定时关单任务（现在靠读取时惰性关单 + 渠道关单，见 §9.4）。

订单自身的 `status`（`accepted/ready/delivered/cancelled`）与 `tab` 状态机**完全不变**，支付结果只写新增字段（§3.2）。这样历史订单、物流轨迹、取消回补逻辑不受影响。

---

## 2. 通用约定

| 项 | 约定 |
|----|------|
| 认证 | 全部支付接口在 `protected` 组内，靠 `sso_token` Cookie |
| CSRF | 两个写接口需带 `X-CSRF-Token`；真实渠道回调路由需豁免（§9.3） |
| 金额 | 字符串十进制 `"39.90"` + `currency`；渠道侧换成分（int64），禁止浮点参与结算 |
| 时间 | RFC3339 UTC；`expired_at` 决定支付单是否可继续 |
| 幂等键 | `out_trade_no = payment.ID`（24 位 ObjectID，全局唯一、可重入） |
| 错误码 | 400 渠道不合法 / 404 单不存在 / 409 订单已支付 / 422 业务规则不满足 / 500 Mongo 不可用 |

---

## 3. 数据模型

### 3.1 `payments` 集合（新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 即 `out_trade_no`，商户侧唯一 |
| `order_id` / `order_no` | string | 关联订单 |
| `member_id` | string | 归属会员，查询强制带上 |
| `provider` | string | `alipay` \| `wechat`，取自 `orderPaymentMethods` 白名单 |
| `amount` / `currency` | string | 建单时从 `order.total` 快照，后续不随订单变 |
| `status` | string | `pending` \| `success` \| `failed` \| `closed` |
| `prepay_id` | string | 渠道预下单号；**支付宝 precreate 与微信 Native 都不回该字段**，只有 JSAPI/wap 场景才非空 |
| `trade_no` | string | 渠道流水号（真实：`trade_no` / `transaction_id`） |
| `pay_url` | string | 真实：微信 Native 的 `code_url`、支付宝当面付的 `qr_code` |
| `qr_content` | string | 二维码承载文案，与 `pay_url` 同源；mock 下是 `https://qr.mock.alipay.com/…` / `weixin://wxpay/bizpayurl?pr=MOCK…` |
| `created_at` / `expired_at` / `paid_at` | time / time / string | 超时后读取时先渠道关单再本地置 `closed` |

### 3.2 `orders` 新增字段（additive，历史文档无这些字段即视为未支付）

| 字段 | 取值 | 说明 |
|------|------|------|
| `payment_status` | `""` \| `unpaid` \| `paid` \| `failed` | 建单即 `unpaid`（历史种子数据为 `""`）；`paid` 不可回退 |
| `payment_txn_no` | string | 冗余渠道流水号，客服/对账定位用 |
| `paid_at` | RFC3339 | 收款时间 |
| `payment_method` | `alipay` \| `wechat` | 已有字段，支付成功后由支付服务确认为实际渠道 |

---

## 4. 状态机

```
支付单 payment.status
  pending ──模拟/渠道成功──> success   （终态，写回 order.payment_status=paid）
          ──渠道失败/用户取消──> failed （终态，order.payment_status=failed，可重新建单）
          ──超过 expired_at───> closed  （终态，需重新建支付单）

订单 order.payment_status
  ""（未支付）──> paid | failed；paid 不可回退
```

并发与重复回调都靠**同一条条件更新**收敛：

```js
// 只有 pending 能被结算一次，第二次回调 ModifiedCount=0 → 直接返回既有结果
updateOne({ _id: paymentID, status: "pending" }, { $set: { status: "success", ... } })
```

---

## 5. 接口清单

| 方法 | 路径 | 入参 | 出参 `data` |
|------|------|------|-------------|
| POST | `/api/payment/prepay` | `{ "order_id": "...", "provider": "alipay" }` | `Payment`（含 `id`、`amount`、`pay_url`、`expired_at`、`mock_credential`） |
| GET | `/api/payment/query/{id}` | — | `Payment`；`pending` 且已超时则渠道关单 + 本地落 `closed` 再返回；真实渠道下顺带主动查单收敛 |
| POST | `/api/payment/launch/{id}` | `{ "outcome": "success" \| "failed" }`（只有 mock 读它）；query `openid`（微信 JSAPI 必需） | `Launch`：`{ "kind", "payment_id", "provider", "action", "fields", "url", "jsapi", "qr_content" }`，只填当前 `kind` 用得上的字段；已支付 409，已关闭 422 |
| GET | `/api/payment/mock/launch` | query `payment_id`、`outcome` | **mock 专属**的唤起落点：结算后 302 到 `PAY_MOCK_RESULT_URL?payment_id=...`；形态与真实渠道的同步跳转一致，故为免登录 GET；真实渠道下 400 |
| POST | `/api/payment/mock-notify/{id}` | `{ "outcome": "success" \| "failed" }` | `Payment`；**仅 `PAY_PROVIDER=mock`，前端已改走 `launch`，这条留给 curl 联调** |
| POST | `/api/payment/notify/{provider}` | 渠道原文（支付宝表单 / 微信 V3 加密报文） | 支付宝回 `success`、微信回 `{"code":"SUCCESS"}`；免登录、CSRF 豁免、验签不过即失败应答 |

六条路由由 `payment/http.go` 的 `RegisterMember` / `RegisterPublic` 注册，商城只在 `routers/router.go` 里挂分组，不再有自己的支付 handler。

**唤起（`Launch`）与预下单（`Prepay`）为什么要分开**：`Prepay` 建单时只能拿到与该端无关的收银台素材（Native/当面付的二维码），而「用什么产品把用户送去付款」取决于请求当下的端环境——UA 是桌面还是移动浏览器、是不是微信内置浏览器、有没有 `openid`。所以渠道产品选择在 `Launch` 里做，点一次「唤起支付」取一次指令，续付与重试都走同一条代码：

| 渠道 | 端 | `kind` | 渠道产品 |
|------|----|--------|----------|
| 支付宝 | 移动端浏览器 | `form` | `alipay.trade.wap.pay`（服务端签好名的自提交表单） |
| 支付宝 | 桌面 | `qrcode` | 建单时的 `alipay.trade.precreate` 二维码 |
| 微信 | 微信内置浏览器 | `jsapi` | `/v3/pay/transactions/jsapi` + 第二段 RSA 签名，前端交 `WeixinJSBridge` |
| 微信 | 其他移动浏览器 | `redirect` | `/v3/pay/transactions/h5` 的 `h5_url` |
| 微信 | 桌面 | `qrcode` | 建单时的 Native `code_url` |
| mock | 任意 | `redirect` | 自托管 `/api/payment/mock/launch` |

前端 `payment/launch.js` 是唯一的执行器：`form` 拼隐藏表单自提交、`redirect` 整页跳转（页面已经走了，结果由渠道回调写入服务端，落地页再查）、`jsapi` 等 `WeixinJSBridgeReady` 后按 `err_msg` 收敛、`qrcode` 留在收银台轮询。**换端只换这一份执行器的实现，页面不感知渠道差异。**

行为约束（真实接入后语义保持不变，前端不用改）：
- 同一订单**同一渠道**存在未过期的 `pending` 支付单时，`POST /api/payment/prepay` **复用**并返回原单，不产生第二笔；换渠道则重新预下单。
- 订单 `payment_status=paid` 后再建支付单 → 409 `该订单已支付`。
- 订单已结束（`tab=history`）→ 422 `该订单已结束，无法支付`。
- 查询、唤起与模拟回调都按 `member_id` 限定，别人的支付单一律 404 `支付单不存在`，不泄露存在性。
- 唤起只认 `pending` 单：已 `success` → 409 `该订单已支付`，已 `closed`/`failed` → 422 `支付单已关闭，请重新发起支付`；取单时照样跑超时惰性关单与真实渠道查单收敛，不会把已失效的单送去渠道。
- mock 回跳 `GET /api/payment/mock/launch` 按 `payment_id` 定位（等同渠道回传的 `out_trade_no`），重复回跳只认第一次结算结果。
- 已 `success` 的支付单重复回调 → 200，返回同一结果，不重复改单。
- `closed`/`failed` 的支付单再回调 → 422 `支付单已关闭，请重新发起支付`。
- 渠道回调金额（含分↔元换算后）与 `payment.amount` 快照不严格相等 → 不改单、应答失败。

---

## 6. mock 商户信息（**全部为假，不可用于任何真实调用**）

`payment/settings.go`，读环境变量、回落假值。假值统一含 `MOCK` 字样，避免误当真实密钥提交或调用。
`PAY_PROVIDER=mock` 下这些密钥**不会被用于任何签名或外呼**（适配层在发请求前就短路回假报文），只有切到 `alipay`/`wechat` 才会真正读取。

| 渠道 | 字段 | 环境变量 | mock 值 |
|------|------|----------|---------|
| 总开关 | provider | `PAY_PROVIDER` | `mock`（可选 `alipay` / `wechat`） |
| 支付宝 | 应用 ID | `ALIPAY_APP_ID` | `2021000000MOCK0001` |
| | 应用私钥 | `ALIPAY_PRIVATE_KEY` | `MOCK-ALIPAY-APP-PRIVATE-KEY` |
| | 支付宝公钥 | `ALIPAY_PUBLIC_KEY` | `MOCK-ALIPAY-PUBLIC-KEY` |
| | 网关 | `ALIPAY_GATEWAY` | `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |
| | 异步回调 | `ALIPAY_NOTIFY_URL` | `http://localhost:8080/api/payment/notify/alipay` |
| | 同步跳转 | `ALIPAY_RETURN_URL` | `http://localhost:5173/orders` |
| 微信 | 应用 appid | `WECHAT_APP_ID` | `wxmock000000000001` |
| | 商户号 mchid | `WECHAT_MCH_ID` | `1900000101` |
| | APIv3 密钥 | `WECHAT_APIV3_KEY` | `MOCK-WXPAY-APIV3-KEY-32BYTES-XXXX` |
| | 商户证书序列号 | `WECHAT_MCH_SERIAL_NO` | `MOCKSERIAL0000000000000000000001` |
| | 商户私钥 | `WECHAT_MCH_PRIVATE_KEY` | `MOCK-WECHAT-MCH-PRIVATE-KEY` |
| | 平台证书 | `WECHAT_PAY_PLATFORM_CERT` | `MOCK-WECHATPAY-PLATFORM-CERT` |
| | 下单域名 | `WECHAT_GATEWAY` | `https://api.mchpay.mock/v3` |
| | 异步回调 | `WECHAT_NOTIFY_URL` | `http://localhost:8080/api/payment/notify/wechat` |
| 通用 | 支付单有效期 | `PAY_EXPIRE_MINUTES` | `15` |
| 模拟唤起 | 自托管落点 | `PAY_MOCK_LAUNCH_URL` | `/api/payment/mock/launch`（同源相对路径，前端代理与正式域名下都不用改） |
| | 结果页 | `PAY_MOCK_RESULT_URL` | `http://localhost:5173/payment/result`（真机联调要换成可访问的地址） |

`Payment.mock_credential` 在 `PAY_PROVIDER=mock` 时回显当前假商户号，用于在模拟收银台上确认「配置读取生效」；真实渠道下该字段为空，**绝不回显任何密钥**。

---

## 7. 真实支付宝接入

选型（本项目是 H5 + 可选打包 App）：

| 场景 | 产品/接口 | 状态 | 备注 |
|------|-----------|------|------|
| 扫码 | `alipay.trade.precreate` | **已实现** `payment/alipay.go:Prepay` | 返回 `qr_code`，落 `pay_url`/`qr_content` |
| 兜底查询 | `alipay.trade.query` | **已实现** `Query`，`GET /api/payment/query/{id}` 在真实渠道下自动调用 | 回调丢失时按 `out_trade_no` 主动查 |
| 关单 | `alipay.trade.close` | **已实现** `Close`，支付单判超时那一刻调用 | 超时未付 |
| 异步回调 | `/api/payment/notify/alipay` | **已实现** 表单验签 + 状态/金额核对 | 见 §9.3 |
| H5 浏览器内 | `alipay.trade.wap.pay` | **已实现** `payment/alipay.go:Launch` · `kind=form` | 服务端按字典序签好名，前端只填隐藏表单自提交到网关；收款结果仍以 `notify_url` 为准，`return_url` 只做展示 |
| 打包 App | `alipay.trade.app.pay` | 未接 · **P3 计划** | 服务端只产出 `orderStr`（已签名），客户端 SDK 拉起；`Launch` 再加一种 `kind` 即可 |
| 退款 | `alipay.trade.refund` | 未接 | 当前订单取消只回补库存与券 |

> **待决策**：`precreate`（建单时）与 `wap.pay`（唤起时）用的是同一个 `out_trade_no`。真实接入时要么建单前就按端选好产品（把 `LaunchEnv` 提前到 `Prepay`），要么让 `wap.pay` 覆盖同名单——支付宝对同一 `out_trade_no` 换产品的行为需在沙箱实测后定，当前代码保留两份产品各自的正确拼参与签名，不改状态机。

已落实的技术点（代码就在适配层，换密钥不换流程）：
1. **签名 RSA2（SHA256withRSA）**：公共参数 + `biz_content` 按字典序拼串后签名，空值与 `sign`/`sign_type` 不参与（`sortedQuery`）。
2. **回调验签**：剔除 `sign`、`sign_type` 后用支付宝公钥验签，再核对 `app_id`、`out_trade_no`、`total_amount`、`trade_status`，全对才认；响应体回 `success`。
3. **异步 + 主动查询双保险**：回调走 `Service.Notify`，前端轮询 `GET /api/payment/query/{id}` 时走 `Query`，两条路都汇到 `settle`。

仍需业务决策：
1. **密钥形态**：目前是公钥模式（应用私钥 + 支付宝公钥）。若走**公钥证书模式**（`appCertPublicKey`、`alipayCertPublicKey_RSA2`、`alipayRootCert`），要加三个字段并按证书序列号验签。
2. **场景扩展**：H5/APP 支付要新增 `Provider` 实现并在 `Prepay` 里按端选择，接口层不变。

---

## 8. 真实微信支付接入

| 场景 | 接口 | 状态 | 备注 |
|------|------|------|------|
| PC/浏览器扫码 | `/v3/pay/transactions/native` | **已实现** `payment/wechat.go:Prepay` | 返回 `code_url` → 直接填 `pay_url` |
| 兜底查询 | `/v3/pay/transactions/out-trade-no/{out_trade_no}` | **已实现** `Query` | 带 `mchid` |
| 关单 | 同上 `/close` | **已实现** `Close` | 超时未付 |
| 异步回调 | `/api/payment/notify/wechat` | **已实现** 防重放 + 验签 + AEAD 解密 | 见 §9.3 |
| 公众号/小程序内 | `/v3/pay/transactions/jsapi` | **已实现** `payment/wechat.go:Launch` · `kind=jsapi` | 需用户 `openid`（query 传入，没有则 422 提示先授权）；`prepay_id` 落库后再签一次给前端 `WeixinJSBridge`，这也是唯一会填 `prepay_id` 的场景 |
| H5 | `/v3/pay/transactions/h5` | **已实现** `payment/wechat.go:Launch` · `kind=redirect` | 需报备 H5 域名，返回 `h5_url` 后前端整页跳转拉起 |
| 退款 | `/v3/refund/domestic/refunds` | 未接 | |
| 对账 | `/v3/bill/tradebill` + `fundflow` | 未接 | §9.5 |

> 微信 UA 判定在 `payment/launch.go:IsWechatBrowser`/`IsMobile`：内置浏览器 → JSAPI，其他移动浏览器 → H5，桌面 → 沿用建单时的 Native 二维码。小程序与 App 各自再加分支（P2/P3），不改这三条。

已落实的技术点：
1. **Authorization 头**：`WECHATPAY2-SHA256-RSA2048`，签名串 = `method\nurl\ntimestamp\nnonce\nbody\n`（url 含 query），商户私钥 RSA-SHA256 签，带 `mchid`/`serial_no`/`nonce_str`。
2. **回调验签 + 解密**：`Wechatpay-Timestamp/Nonce/Signature/Serial` 四头，时间戳偏差 >5 分钟按重放拒绝；平台证书公钥验签 `${timestamp}\n${nonce}\n${body}\n`；`resource` 用 APIv3 Key 做 **AEAD_AES_256_GCM** 解密，再核对 `trade_state` 与 `amount.total`/`payer_total`（分 → 字符串十进制后与快照严格比对）。
3. **回调应答**：成功 HTTP 200 + `{"code":"SUCCESS"}`；任一环节失败回 503 + `{"code":"FAIL"}` 让微信按策略重投，绝不吞错。

仍需业务决策：
1. **平台证书自动更新**：`/v3/certificates` 用 APIv3 Key 解密下载并缓存轮换，或改用「微信公钥 ID」模式。当前只读 `WECHAT_PAY_PLATFORM_CERT` 配置的静态证书/公钥。
2. **金额币种**：`amount.currency` 取自支付单（当前商城为 `USD`）。境内商户只支持 `CNY`，切真实渠道前要么改价币种、要么走境外商户报备。

---

## 9. 一致性、安全与补偿（真实上线前必须逐条过）

**9.1 金额复核（已落地）**：`settle` 双向核对——回调/查询金额必须等于 `payment.amount`（建单快照，`payment.money` 的 `amountFen`/`fenToAmount` 只做字符串整数运算），`payment.amount` 又由建单时的 `order.total` 快照而来（`OrderGateway.Order`）；不等只记失败，绝不改单。

**9.2 幂等（已落地）**：见 §4 的条件更新（`payment/store.go` 的 `settleDoc`），三条入口（模拟回调、公网回调、主动查单）都汇到 `Service.settle` 一处；只有 `ModifiedCount==1` 那一次才调 `OrderGateway.Settle` 写订单，回调重放不会把 `paid_at` 改晚。

**9.3 CSRF 与回调路由（已落地）**：真实回调是**公网、无 Cookie、无会话**的 POST，实现要点：
- 路由 `POST /api/payment/notify/:provider` 由 `payment/http.go:RegisterPublic` 挂在 `api` 组而**不是** `protected`（不要求 JWT），仍受 `RateLimitMiddleware` 约束；
- `middleware/csrf.go` 用 `csrfExemptPrefixes = ["/api/payment/notify/"]` 按前缀豁免（两个渠道共用一条路由，故不按完整路径枚举）；
- 身份由**渠道验签/解密**保证：`Provider.ParseNotify` 任一步不过就返回失败，请求体里自称的金额/状态一律不采信；`payment.NotifyAck` 负责按渠道格式应答，失败时显式回非成功让渠道重投；
- 回调只按报文里的 `out_trade_no` 定位支付单（`Service.rawByID`），并核对 `payment.provider` 与回调渠道一致；
- mock 的 `/api/payment/mock-notify/:id` 仍刻意由 `RegisterMember` 挂在 `protected` 组内，因为它由本站前端触发；mock 模式下公网回调直接失败应答，不跳过验签。
- mock 的唤起落点 `GET /api/payment/mock/launch` 与渠道同步跳转同形：浏览器顶层导航只能是 GET，而 GET 本来就不进 CSRF 校验，所以**没有为它加任何豁免**；它不写敏感数据，只按 `payment_id` 推进那张已存在的单，且真实渠道下直接 400。

**9.4 超时与补偿**：下单即扣库存、占用券（`order_service.Create`）。因此支付单超时/关单要配套：
- 已实现（人工路径）：用户 `POST /api/orders/{id}/cancel` → `restoreStock` + `voucher.Release`；
- 已实现（读路径）：`GET /api/payment/query/{id}` 发现 `pending` 且已过 `expired_at` → 真实渠道下先调 `Provider.Close` 再本地置 `closed`；
- 待实现（自动路径）：定时任务扫 `status=pending && expired_at<now` 的支付单 → 渠道 `close` → 本地 `closed` → 未支付订单自动取消并回补。现在只有「有人来读才关」，用户不再访问就留下的过期单仍会占库存，**接入真实渠道前必须补这条**。
- 支付成功但取消已发生的竞态：以条件更新为准（`pending→success` 与 `tab: ongoing→history` 互斥），冲突时走人工退款。

**9.5 对账**：每日拉渠道账单（支付宝 `alipay.downloadBill` / 微信 `tradebill`），与 `payments` 按 `out_trade_no` 三方比对，输出「渠道成功本地未支付」「本地支付成功渠道无记录」两类差异人工处理。

**9.6 密钥管理**：私钥/APIv3 Key 只从环境变量或密钥服务注入，不进仓库、不进日志、不进任何响应体；`mock_credential` 这类回显字段必须在非 mock 模式下为空。

**9.7 前端不得决定支付结果**：收款结果只由服务端 `settle` 写。mock 的「唤起支付」按钮也不直接改状态——它拿 `Launch` 后把页面送去自托管落点，由那里按渠道回调的同一份逻辑结算；真实渠道下前端只做两件事：`applyLaunch` 执行指令，然后轮询 `GET /api/payment/query/{id}`（微信 JSAPI 额外参考 `getBrandWCPayRequest` 的 `err_msg`，但那也只用来决定「继续等还是提示」，入账仍以服务端为准）。

---

## 10. 业务方需要提供的信息（接入前置）

| 渠道 | 需要 | 谁提供 | 备注 |
|------|------|--------|------|
| 支付宝 | 企业/个体工商户营业执照 | 商务 | 沙箱不需要，正式需要 |
| | 开放平台应用 + `app_id` | 运营申请 | 建应用后要「签约」手机网站支付 / APP 支付 |
| | 应用公私钥（或三份证书） | 研发生成 | 用官方密钥工具生成，私钥自持 |
| | 支付宝公钥/证书 | 平台下载 | 证书模式还要根证书 |
| | 结算账户、费率、退款规则 | 商务 | |
| 微信 | 微信开放平台/公众号/小程序主体 | 商务 | JSAPI 必须与 appid 同主体 |
| | 商户号 `mchid` + 签约产品（JSAPI/Native/H5） | 商务 | |
| | APIv3 Key、商户证书序列号、商户私钥 | 商户平台设置 | 私钥 CSR 自持 |
| | 回调域名白名单 + HTTPS 证书 | 运维 | 公网可达、备案、HTTPS |
| 通用 | `notify_url` 两组、`return_url` | 运维/前端 | 正式域名不能带端口 |

---

## 11. 落地顺序（切换真实渠道时按步走）

1. ~~**抽接口**~~ **已完成**：`payment/provider.go` 定义
   ```go
   type Provider interface {
       Name() string
       Prepay(ctx context.Context, p *Payment) (*PrepayResult, error)      // 返回 prepay_id / code_url / qr_code
       Launch(ctx context.Context, p *Payment, env LaunchEnv) (*Launch, error) // 按端选产品，产出唤起指令
       ParseNotify(req *http.Request) (*NotifyResult, error)               // 验签 + 解密 + 金额校验
       Query(ctx context.Context, p *Payment) (*NotifyResult, error)       // 兜底
       Close(ctx context.Context, p *Payment) error                        // 关单
   }
   ```
   `alipayProvider` / `wechatProvider` 里是真实的拼参、签名、外呼与解析；mock 只在 `PAY_PROVIDER=mock` 时把「响应体」换成同结构假报文，业务层与前端零改动。
2. ~~**模块独立**~~ **已完成**：`payment/` 与 `frontend/src/payment/` 各自成模块，对外只暴露
   `payment.NewModule(orders OrderGateway, memberID MemberFunc) *Module`、`RegisterMember` / `RegisterPublic`，以及前端的 `prepay` / `queryPayment` / `launchPayment` / `applyLaunch` / `PROVIDERS` / `PaymentSheet`。
   支付不 import 商城代码，订单侧只实现 `OrderGateway.Order` / `Settle` 两个方法（`services/payment_gateway.go`）。
3. ~~**唤起支付（H5/网页）**~~ **已完成**：`Launch` 契约 + 四种 `kind`（§5），支付宝 `wap.pay` 表单、微信 H5/JSAPI/扫码各就各位；前端 `payment/launch.js` 一份执行器，`pages/PaymentResult.jsx` 承接被渠道带走后的落地轮询。mock 也走 redirect，跳出去再跳回来，骨架与真实渠道一致。
   **注意**：mock 下所有渠道统一回 `redirect`，所以 `form`/`jsapi`/`qrcode` 三条分支要在真实沙箱里各验一次；`PAY_MOCK_RESULT_URL` 默认只指向 `localhost:5173`，真机联调需换成可访问地址。
4. **配置注入**：把 §6 的假值换成环境变量（支付宝沙箱 + 微信仿真系统起步），`PAY_PROVIDER=alipay|wechat`。这一步之外不需要改代码。
   注意微信境内商户只支持 `CNY`（§8），支付宝无此限制；`ALIPAY_RETURN_URL` / `PAY_MOCK_RESULT_URL` 要指向 `/payment/result?payment_id=...` 那种形态的落地页。
5. ~~**公网回调**~~ **已完成**：`POST /api/payment/notify/:provider` + CSRF 前缀豁免（§9.3）。上线前要把回调域名换成公网 HTTPS 备案域名，并用渠道的「发起回调/模拟支付」工具验一次验签。
6. **状态收敛**：条件更新与主动查单已就绪（§9.1/§9.2、`Service.reconcile`）。还差「同一订单只允许一笔有效支付单」的约束——目前换渠道会各留一笔 `pending`，需要决定是取消旧单还是允许并存；§7 的 `precreate` 与 `wap.pay` 共用 `out_trade_no` 也在这一并定。
7. **超时任务**：§9.4 的自动关单 + 库存/券回补，带分布式锁或 Mongo 唯一部分索引防并发。
8. **退款与对账**：订单取消改走渠道退款（`alipay.trade.refund` / `/v3/refund/domestic/refunds`）；每日账单核对任务（§9.5）。
9. **灰度**：`PAY_PROVIDER` 按环境切换，先只放量 `alipay`，`wechat` 观察一轮账单后再开。

> 小程序（P2）与 App（P3）等基础功能打磨完再上：两者都不动状态机，只加 `Launch` 的 `kind`（小程序 `launcher` 产 `requestPayment`/`tradePay` 参数，App 产 SDK `orderStr`）与前端的执行器分支。

---

## 12. 本地联调（mock 全链路）

```bash
# 1) 会员登录（账号由 /api/register 注册，Cookie 罐 + CSRF）
curl -s -c /tmp/cjM.txt -X POST http://localhost:8080/api/login \
  -H 'Content-Type: application/json' -d '{"username":"<注册邮箱>","password":"<密码>"}'
CSRF=$(awk '/sso_csrf/ {print $NF}' /tmp/cjM.txt)

# 2) 下单
curl -s -b /tmp/cjM.txt -X POST http://localhost:8080/api/orders \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"payment_method":"alipay"}'
# -> data.id = 订单 ID

# 3) 建支付单（返回假商户号与二维码位）
curl -s -b /tmp/cjM.txt -X POST http://localhost:8080/api/payment/prepay \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"order_id":"<ORDER>","provider":"alipay"}'
# -> data.id = 支付单 ID, data.status = pending；重复调用会复用同一张 pending 单

# 4) 唤起：按 UA 选产品，mock 回 redirect（真实渠道下 form/h5_url/jsapi 参数/二维码各回一种）
curl -s -b /tmp/cjM.txt -X POST http://localhost:8080/api/payment/launch/<PAYMENT> \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' \
  -d '{"outcome":"success"}'
# -> data.kind = redirect, data.url = /api/payment/mock/launch?payment_id=<PAYMENT>
#    浏览器整页跳过去即完成结算，随后 302 到 PAY_MOCK_RESULT_URL?payment_id=<PAYMENT>

# 4b) 模拟异步回调（幂等：重复调用返回同一结果；前端已改走唤起，这条留给纯接口联调）
curl -s -b /tmp/cjM.txt -X POST http://localhost:8080/api/payment/mock-notify/<PAYMENT> \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"outcome":"success"}'
# -> data.status = success；订单入账看 GET /api/orders/{id} 的 payment_status=paid

# 4c) 前端兜底轮询（超时则惰性置 closed）
curl -s -b /tmp/cjM.txt http://localhost:8080/api/payment/query/<PAYMENT>

# 5) 已支付订单再建支付单 -> 409 该订单已支付

# 6) 公网回调路由在 mock 下会被拒（应答 failure），它只在真实渠道 + 验签通过时生效
curl -s -X POST http://localhost:8080/api/payment/notify/alipay -d 'out_trade_no=<PAYMENT>&trade_status=TRADE_SUCCESS'

# 7) 越权：换别人的 Cookie 查/回调同一张支付单 -> 404 支付单不存在
```

前端路径：`/checkout` 选支付宝或微信（渠道清单来自 `payment/providers.js`）→ Continue → 下单 + `prepay` → 收银台弹层（`payment/components/PaymentSheet.jsx`）→「唤起支付」拿 `Launch` 并整页跳出去 →（mock 的自托管落点结算后 302）→ `/payment/result?payment_id=...` 轮询出结果（成功 `SKh1XGuRfL`，失败 `q721g3bZFw`）。
「唤起支付（模拟失败）」只在 `mock_credential` 非空时出现，真实渠道下自动隐藏；取消支付不跳走，回结算页保留续付入口。
