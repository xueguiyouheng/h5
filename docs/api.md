# 生鲜商城（FreshMart）数据接口文档 · 草案 v1

> 产品原型、页面清单与优缺点见 [`product-prototype.md`](./product-prototype.md)；本文只写接口契约。

> 状态：**待评审**。本文只定义契约，未改动任何代码。评审通过后再按 §13 的顺序落地。
> 范围：把 `frontend/src` 目前**全部写死或存在 localStorage** 的业务数据整理成后端接口，并覆盖已存在的 `/api/login`、`/api/logout`、`/api/users`。

---

## 1. 通用约定

| 项 | 约定 | 依据 |
|----|------|------|
| Base URL | `/api` | `routers/router.go` |
| 响应信封 | `{ "code": 200, "message": "success", "data": <业务数据> }`；失败 `{ "code": <http status>, "message": "<中文错误>", "data": null }` | `middleware.Success` / `middleware.Error` |
| JSON 命名 | **snake_case** | `models.Pagination`、`models.PageResult` |
| 认证 | 登录签发 JWT 写入 HttpOnly Cookie（`sso_token`），后续请求靠 Cookie，不走 Authorization 头 | `middleware.SetAuthCookie` |
| CSRF | 所有写操作（POST/PUT/PATCH/DELETE）必须带 `X-CSRF-Token`，值等于可读 Cookie `sso_csrf` | `middleware/csrf.go`、`utils/request.js` |
| 未授权 | 401 由前端拦截器统一 `location.href = '/login'` | `utils/request.js` |
| 分页请求 | `page`（从 1 开始）、`page_size`（默认见各接口，上限 50） | `models.Pagination` |
| 分页响应 | `{ "list": [...], "total": <int64>, "page": n, "page_size": n }` | `models.PageResult` |
| 滚动加载 | 前端不再依赖 `hasMore`，改为 `已加载条数 < total` | 需删除 mock 的 `hasMore` 字段 |
| 金额 | `price`、`amount` 一律用**字符串十进制**（`"4.99"`）+ `currency`（`"USD"`）+ `unit`（`"per kg"`）；`"$4.99 / kg"` 这类展示文案由前端拼接 | 现在 mock 把符号和单位烧进字符串，无法参与计算 |
| 时间 | RFC3339 UTC（`"2026-02-06T07:30:00Z"`）；相对时间（"Monday"/"06 Feb"）由前端按本地时区渲染 | `notificationStore.timeLabel` |
| 图片 | 返回绝对 URL 或 CDN key，前端不再 `import` 本地资源 | 现在 28 张 png 全部打包进前端 |
| 语言 | 错误与运营文案按 `Accept-Language` 返回（`en` / `zh` / `ms`），与 `settingsStore.language` 同步 | `LANGUAGES` |

### 1.1 错误码

| code | 场景 | message 示例 |
|------|------|--------------|
| 400 | 参数校验失败 | `姓名需 3-24 个字符` |
| 401 | 未登录 / Token 过期或在黑名单 | `登录状态已失效` |
| 403 | CSRF 校验失败 / 越权访问他人资源 | `请求来源不合法` |
| 404 | 资源不存在 | `商品不存在` |
| 409 | 唯一约束冲突 | `该邮箱已被注册`、`该兑换码已领取` |
| 422 | 业务规则不满足 | `订单金额未达优惠券门槛` |
| 429 | 触发限流（每 IP 每分钟 60 次） | `操作过于频繁，请稍后再试` |
| 500 | 服务端异常 | `服务暂不可用` |

> 校验规则以**后端为准**，前端 `profileStore.RULES` / `addressStore.RULES` 只做即时反馈；两者文案必须逐字一致，否则用户会看到两套提示。

---

## 2. 认证与账号（账户流）

### 2.1 `POST /api/login` ✅ 已存在
- Body：`{ "username": "admin", "password": "admin123" }`
- `data`：`{ "token": "<jwt>", "token_type": "Bearer" }`
- 副作用：写 `sso_token` + `sso_csrf` Cookie
- 待决策：注册页与登录页字段都叫 **Email address**（设计稿 `Uxph5YiA7t`），后端目前是 `username`。建议 `LoginRequest` 增加 `email` 语义（`username` 兼容保留），否则前端 label 要改回 Username。

### 2.2 `POST /api/logout` ✅ 已存在
- 无 Body；`data: null`。Token 进 Redis 黑名单并清 Cookie。

### 2.3 `GET /api/auth/me` 🆕
- 用途：替代现在用 `GET /api/users?page=1&page_size=1` 探测登录态的做法（`services/authService.checkAuth`）。
- `data`：
  ```json
  {
    "id": 12,
    "username": "Adam Smith",
    "email": "Adamsmith@email.com",
    "mobile": "60122578692",
    "avatar_url": "https://cdn.example.com/a/12.png",
    "onboarded": true,
    "account_type": "merchant",
    "is_admin": true,
    "owned_store_id": "store-1",
    "owned_store_name": "FreshMart 旗舰店",
    "created_at": "2026-01-08T02:11:00Z"
  }
  ```

### 2.4 `POST /api/register` 🆕（对应 `MA1FcG-1ER` 注册页）
- Body：
  ```json
  { "username": "Ada Lovelace", "email": "ada@example.com", "password": "Ada@2026x", "mobile": "60123456789" }
  ```
- 规则（等价于 `validateProfileField`）：username 3–24 且仅字母/空格/`. ' -`；email 正则 `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`；password ≥8；mobile  digits 且以 `60` 开头、长 11–13。
- 成功：`201` → `data: { "id": "650f...", "email": "ada@example.com", "verification_required": false, "account_type": "buyer" }`；`account_type` 会落库到会员文档（见 §2「注册区分商家」），商家注册额外回 `owned_store_id`。
- 失败：400（字段校验，`message` 为具体字段文案）/ 409（`email`、`mobile` 已存在）
- 前端改动：`pages/Register.jsx` 的 `Next` 改为调用本接口，成功后不再 `setField` 写 localStorage，而是跳 `/login` 并带 `state.registered = email`。

### 2.5 `POST /api/auth/password/reset` 🆕（对应 `ihtTti_11S` Forgot Password，尚未还原成页面）
- Body：`{ "email": "ada@example.com" }` → `data: { "sent": true, "channel": "email" }`
- 防枚举：邮箱不存在也返回 200。

### 2.6 `POST /api/auth/password/reset-verify` 🆕（对应 `dNt1hrNCKm` Verify）
- Body：`{ "code": "482913", "new_password": "Ada@2027x" }` → `data: null`
- 配套：`POST /api/auth/password/reset/resend`。

---

## 3. 店铺与商品（下单流）

### 3.1 `GET /api/shop/home` 🆕（首页 `c6pfnDn51g` 一次拉齐）
- Query：`recommend_page`、`recommend_page_size`（默认 1 / 10）
- `data`：
  ```json
  {
    "greeting": { "name": "Adam", "avatar_url": "..." },
    "sections": [
      { "key": "exclusive_offer", "title": "Exclusive Offer", "items": [ /* ProductCard */ ] },
      { "key": "best_selling", "title": "Best Selling", "items": [] }
    ],
    "recommend": { "list": [], "total": 60, "page": 1, "page_size": 10 }
  }
  ```

### 3.2 `GET /api/shop/categories` 🆕（`fetchCategories`）
- Query：`page`、`page_size`（默认 8）→ `PageResult<Category>`
- `Category`：`{ "id": 1, "label": "Fresh Vegetables & Fruits", "image_url": "...", "product_count": 18 }`
- 说明：现在 26 条分类里 8 条是真实设计稿数据、18 条是我为填满滚动列表造的占位（`MOCK_CATEGORIES` 9–26），接真接口后由后端给全量。

### 3.3 `GET /api/shop/products` 🆕（`fetchProducts`，商品列表唯一入口）
- Query（全部可选，只靠字段区分场景）：
  | 字段 | 含义 | 用在哪 |
  |------|------|--------|
  | `section` | 运营版块 `exclusive_offer` / `best_selling` / `recommend` | 首页 |
  | `category_id` + `subcategory` | 类目与其下子类目（`All`/空串视为不过滤） | 类目页 |
  | `q` | 名称/描述模糊匹配 | 搜索页 |
  | `favorite=true` | 只看当前会员的收藏 | 收藏页、Profile 收藏数 |
  | `sort=sales` | 销量倒序；留空按运营排序 `sort` 升序 | 搜索页 |
  | `page` / `page_size` | 分页，`page_size` 上限 50 | 全部 |
- `data`：`PageResult<ProductCard>`，只含 `status=on` 的商品。
- 说明：搜索页/类目页/猜你喜欢/收藏页共用这一个接口，不再有 `/shop/search`、`/shop/categories/{id}/products`。

### 3.4 `GET /api/shop/categories/{category_id}` 🆕（`fetchCategory`）
- `data`：`{ "id": "cat-1", "label": "...", "name": "...", "image_url": "...", "product_count": 15, "subcategories": ["All","Leaf Vegetables", ...] }`
- 只给类目自身的标题与子类目 tab；类目下的商品走 3.3 的 `category_id`。

### 3.5 `GET /api/shop/search/hot`（`fetchHotSearch`）
- `data`：`{ "keywords": ["..."], "categories": [Category] }`，`/search` 页空关键词态用。

### 3.6 `GET /api/shop/products/{product_id}` 🆕（`fetchProductDetail`）
- `data`：
  ```json
  {
    "id": "cat1-1", "name": "Broccoli", "price": "4.99", "currency": "USD", "unit": "per kg",
    "hero_image_url": "...", "images": ["..."],
    "description": "Choose broccoli heads with tight, green florets...",
    "nutrition": { "calories": 34, "per": "100g" },
    "stock": 24,
    "collected": true,
    "related": [ { "id": "rel-cucumber", "name": "Cucumber", "price": "4.99", "image_url": "..." } ]
  }
  ```
- 现在只有 `cat1-1` 有真文案（`DETAIL_OVERRIDES`），其余商品描述是模板句 —— 接真接口后由后端提供。

**ProductCard（列表卡片）**：`{ "id", "name", "price", "currency", "unit", "image_url", "badge"?, "old_price"?, "collected", "stock" }`
- `collected`：当前会员是否已收藏，未登录恒 `false`；列表页心形状态由它驱动。
- `stock`：列表卡片带库存，供收藏这类「不进详情页直接加购」的列表提前标售罄（详情页 `ProductDetail.stock` 早就有）。

### 3.7 收藏 🆕
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/shop/favorites` | Body `{ "product_id": "..." }`，收藏与取消收藏同一个入口 → `{ "product_id", "collected", "count" }` |
| DELETE | `/api/shop/favorites` | Body `{ "product_ids": ["..."] }`，收藏页行尾 × 取消单条（接口支持批量）→ `{ "removed", "count" }` |
- 收藏列表本身没有独立端点：`GET /api/shop/products?favorite=true`（3.3），收藏数取其 `total`。
- 排序跟随商品自身的排序（`sort` 升序 / `sort=sales`），不按收藏时间，理由是同一条列表口径。
- 集合 `favorites` 上有 `(member_id, product_id)` 唯一索引，重复收藏不会脏数据。

### 3.8 门店（商家与附近门店）🆕

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/shop/stores/nearby` | 买家侧附近门店，按直线距离升序 |
| PUT | `/api/shop/stores/selection` | 买家切换当前门店，Body `{ "store_id", "longitude", "latitude" }` → `{ "store_id", "name", "out_of_range" }` |
| GET | `/api/admin/store` | 中台：本店资料 |
| PUT | `/api/admin/store` | 中台：编辑本店资料 |

- **门店地址 ≠ 收货地址**：`Store.address` 是卖家发货的店址，只在注册（`store_address`）与中台「门店资料」里维护；买家的 `/api/addresses` 只服务收货与结算，两者互不派生。
- `/api/shop/stores/nearby` Query：`longitude`/`latitude`（可缺省，未定位时按创建顺序返回且 `located=false`）、`keyword`（门店名模糊）。
  `data`：`{ "list": [ StoreItem ], "located": true }`，`StoreItem` = `Store` + `{ "distance_meters", "out_of_range", "current", "distance_text" }`；`current` 标记买家当前选中的那家店。
- `Store`：`{ "id", "name", "logo_url", "description", "phone", "address", "longitude", "latitude", "delivery_radius_km", "min_order_amount", "notice", "status": "open"|"closed", "created_at", "updated_at" }`。`status=closed` 的门店买家侧不可选（422）。
- **一单一店**：`store_id` 已下沉到 `products`/`categories`/`carousels`/`orders`/`carts`（购物车按行归属），订单建单时快照 `store_id`+`store_name`+收货信息，之后不受门店资料变化影响。切店不丢车：另一个门店的购物车行只是被隐藏。
- 注册区分商家：`POST /api/register` 增加 `account_type`（`buyer`|`merchant`，缺省 `buyer`）、`store_name`、`store_address`、`longitude`、`latitude`；`merchant` 必填门店名称（2-30 字）与门店地址（≥6 字，`ValidateStore`），注册即建店并在 `data.owned_store_id` 回门店 ID，同时把新店写成该账号的 `default_store_id`，商家账号本身仍是买家。入驻审核流程留 `TODO(商家入驻)`。
- `account_type` 是账号自身的字段：注册时随会员文档落库（`members.account_type`），`POST /api/register` 出参与 `GET /api/auth/me`、`PUT /api/profile` 都会回显；`merchant` 时 `is_admin` 同为 true。存量账号（种子数据、SSO 自动建档）文档里没有该字段，由 `controllers/context.go` 的 `markMerchant` 按「名下有无门店」补：有门店→`merchant`，否则→`buyer`，因此出参不会出现空类型。
- 中台入口收口：`AdminShopScope` 用 `owner_member_id` == 当前会员的第一家门店注入 `storeID`，名下无门店的账号一律 403「该账号没有可运营的门店，请使用商家账号注册」。中台接口只认这个 `storeID`，**不接收**请求参数里的 `store_id`；买家在首页切店不影响商家中台看到的店。
- `PUT /api/admin/store` Body 为 `models.StoreProfileRequest`，字段留空表示不修改（坐标要成对给，半径必须 >0），所以编辑页初值直接灌当前资料。
- 前端接线：`stores/shopsStore.js`（附近门店 + 当前门店 + `relocate()` 浏览器定位兜底）、`utils/locate.js`（拿不到位置返回 `null`，不抛）、`components/StoreSwitcher.jsx`（首页头部选店，切店后 `invalidateQueries()` 全量重取并重拉购物车）、`pages/Register.jsx`（买家/商家切换与门店资料校验）、`pages/admin/AdminStore.jsx`（商家改门店地址）。

---

## 4. 购物车（`yEMojet72x`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cart` | 全量行项目 + 汇总 |
| POST | `/api/cart/items` | Body `{ "product_id": "cat1-1", "qty": 1 }`；已存在则累加（等价 `addItem`） |
| POST | `/api/cart/items/batch` | Body `{ "items": [ { "product_id", "qty" } ] }`，收藏页「一键加入购物车」；单次上限 100 条，任一条下架/库存不足整批不生效（等价 `addItems`） |
| PATCH | `/api/cart/items/{id}` | Body `{ "qty": 3 }`；`qty=0` 视为删除（等价 `setQty`） |
| DELETE | `/api/cart/items/{id}` | 等价 `removeItem` |
| PUT | `/api/cart/selection` | Body `{ "all": true }` 或 `{ "item_ids": ["..."] }`（等价 `toggleSelect` / `selectAll`） |
| DELETE | `/api/cart` | 清空（等价 `clearCart`） |

- 加购的库存校验按**车上已有量 + 本次量**算（`mergeLine`），报 422 时带上商品名与余量：`「西梅」库存不足，仅剩 0 件`。旧实现只比本次 `qty`，分几次加就能把库存加超。
- 收藏页据此把 `stock<=0` 的行标成「库存不足」并禁用勾选，`全选`/`合计`/`一键加入购物车` 只算有货的行，避免一颗售罄的商品把整批加购挡掉。

`GET /api/cart` 的 `data`：
```json
{
  "items": [
    { "id": "ci-1", "product_id": "cat1-1", "name": "Broccoli", "price": "4.99",
      "currency": "USD", "unit": "per kg", "image_url": "...", "qty": 2, "selected": true,
      "line_total": "9.98", "max_qty": 20 }
  ],
  "selected_total": "19.96",
  "subtotal": "24.95",
  "delivery_fee": "0.00",
  "free_delivery_threshold": "20.00",
  "discount": "0.00",
  "payable": "19.96",
  "applied_voucher_id": null
}
```
- 迁移点：`cartStore` 的 `INITIAL_ITEMS`（3 件写死商品）与 `totalPrice()` 前端求和 → 金额一律由服务端算（券、运费、税都在服务端口径里）。前端 `parsePrice()` 只保留到接口落地前。

### 4.1 `POST /api/cart/checkout-preview` （Checkout 屏 `pYRQwhhHjF`）
- Body：`{ "address_id": "ad-1", "voucher_id": "vc-1", "item_ids": ["ci-1","ci-2"] }`（`item_ids` 必填；`address_id` 空则用默认地址）
- `data`：`{ "items": [CartItem], "currency", "selected_total", "subtotal", "delivery_fee", "free_delivery_threshold", "discount", "payable", "applied_voucher_id", "address"?: Address, "eta": "2026-09-21T10:30:00Z", "voucher_rejected_reason"?: "订单金额未达优惠券门槛" }`
- 金额口径与 `GET /api/cart` 一致，前端只做展示；未达 `free_delivery_threshold` 时 `delivery_fee` 为 `$5.00`。

---

## 5. 优惠券（`fVK-efyqxy`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vouchers` | 我的券包 → `{ "list": [Voucher] }` |
| POST | `/api/vouchers/redeem` | Body `{ "code": "FRESH50" }`；409 = `该兑换码已领取`，400 = `兑换码无效` |
| GET | `/api/vouchers/available` | Query `amount`（购物车选中金额）→ 每张券附 `usable` / `gap_amount` |

**Voucher**：
```json
{
  "id": "vc-1", "title": "30%", "kind": "percent", "value": 30,
  "min_spend": "50.00", "description": "Discount 30% off if you purchase $50 or above",
  "expired_at": "2027-04-30", "source": "redeem_code", "redeem_code": "FRESH50",
  "usable": true, "gap_amount": "0.00"
}
```
- `kind`：`percent` / `shipping` / `fixed`（`fixed` 预留）
- 迁移点：`claimRedeemedVoucher` 现在往模块级数组 `MOCK_VOUCHERS.push`，会**就地污染 react-query 缓存的引用**且刷新即丢 —— 必须由本接口接管。

---

## 6. 收货地址（`iti-MSKzdJ`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/addresses` | `data: { "list": [Address], "default_id": "ad-1" }` |
| POST | `/api/addresses` | Body `{ "label", "detail", "as_default": false }` → 返回新 `id`；首条自动设为默认 |
| PATCH | `/api/addresses/{id}` | Body `{ "label"?, "detail"? }` |
| DELETE | `/api/addresses/{id}` | 删默认地址时服务端回退到列表第一条 |
| PUT | `/api/addresses/{id}/default` | 等价 `setDefault` |

**Address**：`{ "id": "ad-1", "label": "My Home", "detail": "3 Addersion Court, Chino Hills, HO56824, United State", "is_default": true, "updated_at": "..." }`
- 校验：label 2–16 字符；detail ≥12 且必须能用逗号拆出「街道 / 其余」两段（`formatAddressLines` 的服务端口径）。
- Profile 行「默认 X · N 个」由本接口结果算，不再读 localStorage。

---

## 7. 订单（`IovVV9IXXd` / `yDATa6QoOE` / `SKh1XGuRfL`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders` | Query `tab`=`ongoing`\|`history`、`page`、`page_size`（默认 6）→ `PageResult<Order>` |
| GET | `/api/orders/{id}` | 详情 |
| POST | `/api/orders` | Body `{ "address_id"?, "voucher_id"?, "item_ids"?, "payment_method"?: "alipay"\|"wechat" }` → `{ "id": "ord-15", "status": "accepted", "payable": "39.90" }`；支付方式非这两种时 422；驱动 `SKh1XGuRfL` 成功 / `q721g3bZFw` 失败两屏 |
| POST | `/api/orders/{id}/cancel` | 取消并退回优惠券（`FAQS.refund` 描述的规则） |
| GET | `/api/orders/{id}/track` | Track Order 屏：`{ "steps": [{ "code", "label", "at", "done" }], "courier": {...}, "eta" }` |

**Order**：
```json
{
  "id": "ord-1", "order_no": "FM20260206153001", "date": "2026-02-06T07:30:00Z",
  "address": { "id": "ad-1", "label": "My Home" },
  "status": "ready", "tab": "ongoing",
  "items": [ { "product_id": "rc-1", "name": "Broccoli", "image_url": "...", "unit_price": "2.20", "qty": 3, "line_total": "6.60" } ],
  "subtotal": "26.60", "discount": "0.00", "delivery_fee": "0.00", "total": "26.60",
  "voucher_id": null, "payment_method": "alipay"
}
```
**status 枚举**（对应 `ORDER_STATUS_META`，`label`/`icon` 留在前端做展示映射）：

| status | 展示文案 | tab |
|--------|----------|-----|
| `ready` | Ready to collect | ongoing |
| `accepted` | Order accepted | ongoing |
| `delivered` | Order delivered | history |
| `cancelled` | Order cancelled | history |

- 迁移点：`buildOrders()` 现在用 14 条固定日期 × 推荐池随机拼单，金额是「单价×数量」现算 —— 接真接口后 `total` 由服务端给，前端不再求和。

### 7.1 支付（`pYRQwhhHjF` → `SKh1XGuRfL` / `q721g3bZFw`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/payment/prepay` | Body `{ "order_id", "provider": "alipay"\|"wechat" }` → `Payment`；同单**同渠道**存在未过期 pending 时复用返回，换渠道则重新预下单；订单已支付 409，已结束 422 |
| GET | `/api/payment/query/{id}` | 支付单查询，前端轮询用；超时的 pending 会先渠道关单再本地置 `closed`，真实渠道下顺带主动查单收敛状态；只认本人（越权 404） |
| POST | `/api/payment/launch/{id}` | Body `{ "outcome": "success"\|"failed" }`（仅模拟渠道用得着）→ `Launch`；按请求 UA 选渠道产品，前端照指令把页面送到渠道。已支付 409，已关闭 422；渠道参数取 query `openid`（微信 JSAPI 用） |
| GET | `/api/payment/mock/launch` | Query `payment_id`、`outcome`；**模拟渠道专用**的自托管唤起落点，形态等同渠道的同步跳转：结算后 302 到支付结果页。免登录、真实渠道下 400 |
| POST | `/api/payment/mock-notify/{id}` | Body `{ "outcome": "success"\|"failed" }` → `Payment`；**仅 mock 渠道、联调/curl 用**（前端已改走 `launch`），幂等；订单入账结果再看 `GET /api/orders/{id}` |
| POST | `/api/payment/notify/{provider}` | 渠道公网回调，免登录、CSRF 豁免；应答为 `success`（支付宝）/ `{"code":"SUCCESS"}`（微信），不套统一信封 |

**Launch**：`{ "kind": "form"|"redirect"|"jsapi"|"qrcode", "payment_id", "provider", "action", "fields", "url", "jsapi": { "appId", "timeStamp", "nonceStr", "package", "signType", "paySign" }, "qr_content" }` —— 只填当前 `kind` 用得上的字段，前端 `payment/launch.js` 按 `kind` 执行，不拼任何渠道参数

**Payment**：`{ "id", "order_id", "order_no", "provider", "amount": "9.99", "currency": "USD", "status": "pending", "prepay_id", "trade_no", "pay_url", "qr_content", "created_at", "expired_at", "paid_at", "fail_reason", "mock_credential" }`

订单只**新增**支付结果字段（建单即为 `unpaid`），`status`/`tab` 语义不变：`payment_status`（`""`\|`unpaid`\|`paid`\|`failed`）、`payment_txn_no`、`paid_at`。

> 支付是独立模块：后端 `payment/`（`payment/http.go` 自带路由，`payment/settings.go` 自带配置，渠道差异收在 `payment/provider.go` + `payment/alipay.go` / `payment/wechat.go`），前端 `frontend/src/payment/`（`api.js` / `providers.js` / `components/PaymentSheet.jsx`）。
> 支付与订单之间只有一个耦合点 `payment.OrderGateway`，由 `services/payment_gateway.go` 实现；支付代码不 import `services`/`models`。
> 拼参数、签名、外呼、报文解析与验签都是真实实现，`PAY_PROVIDER=mock` 只把「渠道回来的那份响应体」换成同结构的假报文。注入商户信息并改掉开关即可切换，接口契约与前端流程都不用动，详见 **`docs/payment-integration.md`**。

---

### 7.2 中台订单处理 🆕

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/orders` | 本店订单分页；Query `page`、`page_size`（默认 10，上限 50）、`keyword`（单号/收货人/手机号模糊）、`status`、`payment_status`、`since`、`until`（RFC3339）→ `PageResult<Order>`，买家信息联表回填 |
| GET | `/api/admin/orders/summary` | 看板计数 → `{ "all","unpaid","accepted","ready","delivered","cancelled","today_new","today_paid_amount","currency" }`；`today_*` 按**本地今天零点**起算 |
| GET | `/api/admin/orders/{id}` | 详情：`Order` 拍平 + `payments[]`（来自 `payments` 集合的支付流水） |
| PUT | `/api/admin/orders/{id}/status` | Body `{ "status", "note" }`，推进状态 |
| POST | `/api/admin/orders/{id}/cancel` | Body `{ "reason" }`，商家取消：复用买家侧同一套回补逻辑 |
| PUT | `/api/admin/orders/{id}/remark` | Body `{ "admin_remark" }`（≤200 字），与买家 `remark` 分栏互不覆盖 |
| PUT | `/api/admin/orders/{id}/shipping` | Body `{ "courier_name","courier_phone","tracking_no" }`，自配送填骑手、快递填单号 |

- 状态机与买家侧同源：`accepted → ready → delivered`，`ready` 可退回 `accepted`（误点备货完成时纠正），`delivered`/`cancelled` 是终态；非法跳转 422。
- **未支付的单不能开工**：`payment_status != paid` 时推进状态一律 422「买家尚未支付，不能开始处理」。
- 商家取消已支付的单本期没有线上退款能力：只置 `refund_status=pending`，留痕里写明「已收 X，需线下退款」，库存与优惠券照常回补。
- 每次处理都往 `orders.admin_logs` 追加一条 `{ "action","note","operator","at" }`，详情页按时间正序展示为「处理留痕」。
- 别家门店的订单 ID 一律按不存在处理（404），中台取数与改数都以 `AdminShopScope` 注入的 `storeID` 为准。
- 前端页面：`pages/admin/AdminOrders.jsx`（看板卡 + 状态页签 + 筛选 + 双端列表）、`AdminOrderDetail.jsx`（详情与处理），状态常量在 `constants/adminOrder.js`（须与后端 `adminOrderFlow` 同步）。

---

## 8. 通知（`tg5lKXSujV`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | Query `page`、`page_size`（默认 20）→ `PageResult<Notification>` |
| GET | `/api/notifications/unread-count` | `{ "count": 7 }`（Profile 行「N 条未读」） |
| POST | `/api/notifications/read` | Body `{ "ids": ["payment-weekly"] }` |
| POST | `/api/notifications/read-all` | 等价「全部已读」 |

**Notification**：
```json
{
  "id": "offer-15", "kind": "offer", "title": "New offer",
  "description": "Enjoy the special offer up to 15% off on every fresh vegetable box.",
  "created_at": "2026-09-21T01:00:00Z", "read": false,
  "link": { "label": "去逛逛", "route": "/shop" }
}
```
- `kind`：`offer` / `payment` / `promo`（决定图标与底色，映射表留在前端 `KINDS`）
- `link.route` 只允许白名单：`/shop`、`/orders`、`/vouchers`、`/product/:id`、`/category/:id`（防止后端下发任意跳转）
- 迁移点：`daysAgo` 相对时间 → 换成 `created_at`；`readIds` localStorage 持久化 → 换成服务端 `read` 字段（多端同步）。

---

## 9. 帮助与客服（`ZvkHfSL93T` / `OJq4vCCCMN`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/help/faqs` | `data: { "list": [Faq], "support": { "hours", "phone", "email" } }` |
| POST | `/api/help/faqs/{id}/vote` | Body `{ "helpful": true }` → `{ "resolved_count": 2, "total": 4 }` |
| GET | `/api/chat/messages` | Query `cursor`、`limit`（默认 30）→ `{ "list": [Message], "next_cursor" }` |
| POST | `/api/chat/messages` | Body `{ "content_type": "text"\|"image", "text"?, "media_url"? }` → 服务端同时返回自动回复（`data.reply`）或走异步推送 |
| GET | `/api/support/status` | `{ "online": true, "open_label": "09:00", "timezone": "GMT+8" }` |
| POST | `/api/uploads` | `multipart/form-data`，字段 `file` → `{ "url": "...", "name": "...", "size": 12345 }`（聊天发图、头像） |

**Faq**：`{ "id": "not-delivered", "question": "...", "answer": "...", "link": { "label", "route" }, "my_vote": null }`
**Message**：`{ "id": "msg-1", "role": "user"|"agent", "content_type": "text"|"image", "text": "", "media_url": null, "created_at": "...", "link"?: { "label", "route" } }`
- 迁移点：`chatStore.botReply()` 的关键词命中（含"最长关键词优先"的补丁）与 `supportStatus()` 的时区计算应搬到后端；前端只保留 900ms 打字指示器的视觉节奏。`SEED` 三条设计稿对话删除。

---

## 10. 用户资料与设置（`sro_FGWgbC` / `9RqniPG-6p`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/profile` | 等价 `GET /api/auth/me`，二选一即可（建议合并） |
| PUT | `/api/profile` | Body 只传改动字段：`{ "username"?, "email"?, "mobile"?, "gender"?, "password"?, "old_password"? }`；改密码必须带 `old_password` |
| GET | `/api/profile/completeness` | `{ "done": 4, "total": 5, "percent": 80 }`（`profileCompleteness` 的服务端版） |
| GET | `/api/settings` | `{ "language": "en", "rating_average": 4.3, "rating_count": 6 }` |
| PUT | `/api/settings` | Body `{ "language": "zh" }` |
| POST | `/api/settings/ratings` | Body `{ "value": 5 }` → 返回新的平均值（`ratingSummary` 的服务端版） |
| GET | `/api/legal/{key}` | `key`=`terms`\|`privacy` → `{ "key", "title", "body", "updated_at" }` |

- 迁移点：`profileStore`（`shop-profile`）、`settingsStore`（`shop-settings`）、`addressStore`（`shop-addresses`）、`cartStore`（`shop-cart`）、`notificationStore`（`shop-notifications`）、`chatStore`（`shop-chat`）、`helpStore`（`shop-help`）全部退出 persist，只保留 UI 态。
- `LEGAL_COPY` 两段中文文案 → 后端内容管理，前端注册页/设置页共用同一接口。

---

## 11. 引导页（`C8f31WfGTa`）

`GET /api/onboarding/slides`（可选，公开接口）
```json
{
  "list": [
    { "id": "s1", "title": "Fresh from farm to your door", "description": "...", "image_url": "...", "cta": { "login": "/login", "signup": "/register" } }
  ],
  "stats": { "category_count": 26, "product_count": 84, "voucher_count": 3, "lowest_spend": "20.00" }
}
```
- 现在第 2/3 页文案里的分类数、款数、券数是从 mock 常量现算的（`MOCK_CATEGORIES.length` 等），接真接口后由 `stats` 提供。
- 若不做本接口，`/onboarding` 的文案就固定为不含量词的版本，避免数字与实际不符。

---

## 12. 前端数据现状 → 接口映射表

| 现在数据在哪 | 内容 | 目标接口 | 备注 |
|--------------|------|----------|------|
| `api/mock/data.js` `MOCK_CATEGORIES` | 26 条分类 | `GET /shop/categories` | 9–26 条是占位 |
| 同上 `MOCK_PRODUCTS` | exclusive 12 / best 12 / recommend 60 | `GET /shop/products`、`GET /shop/home` | 价格含 `$` 与 `/ kg` |
| 同上 `MOCK_SEARCH_RESULTS` | 6 条搜索结果 | `GET /shop/products?q=` | 关键词分支（fruit/veg）已换成后端模糊查询 |
| 同上 `MOCK_SUBCATEGORIES` | 仅分类 1 有子分类 | `GET /shop/categories/{id}`（元信息）+ `GET /shop/products?category_id=&subcategory=` | 类目下商品与类目信息分两个请求 |
| 同上 `buildCategoryProducts` | 18 条/类随机拼 | 同上 | |
| 同上 `buildProductDetail` + `DETAIL_OVERRIDES` | 详情/相关推荐 | `GET /shop/products/{id}` | 仅 `cat1-1` 有真文案 |
| 同上 `buildOrders` | 14 单，日期+地址池拼单 | `GET /orders` | 金额需服务端 |
| 同上 `MOCK_VOUCHERS` + `REDEEM_CODES` | 3 张券 + 2 个兑换码 | `GET /vouchers`、`POST /vouchers/redeem` | 存在模块数组被 push 的问题 |
| 同上 `ORDER_STATUS_META` | 状态→文案/图标 | 保留前端 | 后端只给 `status` |
| `cartStore` `shop-cart` | 3 件初始商品 + 选中态 + 求和 | `GET /cart` 系列 | 金额迁服务端 |
| `profileStore` `shop-profile` | 姓名/手机/邮箱/密码/性别 + 校验规则 | `PUT /profile`、`POST /register` | 密码明文存 localStorage，**必须移除** |
| `addressStore` `shop-addresses` | 2 条地址 + 默认 | `/addresses` 系列 | |
| `notificationStore` `shop-notifications` | 8 条通知 + `readIds` | `/notifications` 系列 | `daysAgo` → `created_at` |
| `helpStore` `shop-help` | 4 条 FAQ + 投票 | `/help/faqs` 系列 | |
| `chatStore` `shop-chat` | 3 条种子消息 + 自动回复 + 客服时段 | `/chat/messages`、`/support/status` | |
| `settingsStore` `shop-settings` | 语言 + 评分 + `LEGAL_COPY` | `/settings`、`/legal/{key}` | |
| `authService.checkAuth` | 用 `/users` 探测登录态 | `GET /auth/me` | |
| `userStore` / `UserList.jsx` | 后台演示用户列表 | `GET /users`（已有） | 与商城无关，建议单独标记为 admin 模块 |

---

## 13. 落地前必须先修的问题（评审重点）

1. **`api/index.js` 的 axios 实例是错的那一个**：自建 `http = axios.create({ baseURL: '/api' })` 没有 `withCredentials`、没有 `X-CSRF-Token` 拦截器、也没有解 `{code,message,data}` 信封。`USE_MOCK=false` 时所有 shop 接口必然 401 + 结构错位。→ 统一改用 `utils/request.js`。
2. **分页字段不一致**：mock 的 `paginate()` 返回 `pageSize` / `hasMore`，后端 `PageResult` 是 `page_size` 且无 `hasMore`。→ 前端 `paginate` 与所有调用点（Shop / Search / Category / MyOrder）改成 `page_size` + `list.length < total`。
3. **`MOCK_VOUCHERS` 被就地 `push`**：污染 react-query 缓存引用，且刷新丢失兑换结果。→ 兑换走 `POST /vouchers/redeem`，mock 期至少改成返回拷贝。
4. **登录字段语义**（§2.1）与**注册无账号体系**（§2.4）：注册页目前只把资料写进 localStorage，刷新后"账号"不存在。
5. **明文密码存 localStorage**（`shop-profile.password`）：接口化后由后端存哈希；过渡期应先把该字段从 persist 的 `partialize` 里剔除。
6. **公开页回退兜底**：`useGoBack` 无上级时跳 `/shop`，而 `/shop` 是私有路由 → 直接打开 `/login` 点回退会被弹回登录页。建议 `PageHeader` 增加 `fallback` prop（登录/注册 → `/onboarding`）。
7. **校验文案双份**：`profileStore.RULES`、`addressStore.RULES`、`chatStore` 的关键词表要以后端返回的 `message` 为准，前端规则降级为即时反馈。
8. **图片资源**：28 张 png 现在打包在前端（`assets/shop|search|category|detail`），接 `image_url` 后从 mock 层移除；`MOCK_PRODUCT_INDEX` 这类以 id 反查的索引也随之消失。

---

## 14. 建议实施顺序

1. §13 的 1、2（请求层与分页契约）—— 不修则一切联调都是假通过
2. 账户流：`/auth/me`、`/register`、`/password/reset*`（顺带补齐 `ihtTti_11S`、`dNt1hrNCKm` 两屏）
3. 只读列表：categories / products / search / product detail / vouchers / notifications / faqs
4. 写操作：cart 系列 → addresses 系列 → orders（含 Checkout `pYRQwhhHjF` 与成功/失败两屏）
5. 交互数据：chat / uploads / settings / ratings / legal
6. 每步都保留 `USE_MOCK` 开关，mock 层与接口层同名同结构，便于逐页切换验证
