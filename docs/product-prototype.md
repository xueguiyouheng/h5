# FreshMart 生鲜订购 · 产品原型与功能文档（H5）

> 版本：v1 · 2026-09-22
> **范围声明：本文只覆盖 H5（移动网页）端，且 H5 的交易闭环已经完成。**
> **小程序与 App 尚未开发**，本文第 12 章专门整理「换端到小程序 / App 时哪些能直接复用、哪些必须新增」，作为后续立项的输入，不代表已实现。
> 配套文档：接口契约见 [`api.md`](./api.md)，支付接入与切渠道见 [`payment-integration.md`](./payment-integration.md)，库表见 [`database.md`](./database.md)。

---

## 1. 产品定位

| 维度 | 结论 |
|------|------|
| 品类 | 生鲜（果蔬 / 乳品烘焙 / 海鲜 / 肉禽蛋），按门店履约的即时零售 |
| 形态 | 移动优先的 H5 商城 + 一套商家运营中台（同一份前端、同一套账号体系） |
| 核心模型 | **多门店 + 一单一店**：买家同一时刻锁定在一家门店，全部数据（商品 / 类目 / 轮播 / 购物车 / 订单）按门店隔离 |
| 账号模型 | **买家与商家共用一套会员体系**：商家账号天然继承买家全部能力；只有名下有门店的账号才看得到运营中台 |
| 履约 | 门店自配送（配送范围按半径判定），订单轨迹 4 节点，中台推进状态 |
| 支付 | 唤起式（跳出去到支付宝 / 微信再跳回来），当前为 mock 渠道，真实渠道只换环境变量 |
| 币种 | 硬编码 USD（`cartCurrency`），运费与券门槛都以美元计 |

设计源文件：即时设计「生鲜订购电商App页面」，页面容器 `qWY0ofqYEv`，每屏 375×812。

---

## 2. 角色与信息架构

### 2.1 三类身份

```
游客                买家（所有登录账号）           商家（名下有门店的买家）
─────────           ──────────────────            ──────────────────────
/onboarding         全部买家功能                   全部买家功能
/login              · 浏览/搜索/详情                + Profile 出现「运营中台」入口
/register           · 购物车 / 结算 / 支付           + /api/admin/* 全部接口
（注册页可切换        · 订单 / 收藏 / 券 / 地址        + 中台只看到自家门店
  买家 / 商家）       · 通知 / 帮助 / 客服 / 设置      · 门店资料 / 轮播 / 类目 /
                                                    商品 / 素材 / 订单处理
```

- 游客访问任何业务路由 → `PrivateRoute` 弹回 `/login`。
- 商家身份判定在服务端：`controllers/admin_scope.go` 的 `AdminShopScope()` 用 `owner_member_id == 当前会员` 取**第一张门店**（`created_at` 升序）注入 `storeID`；名下无门店直接 **403「该账号没有可运营的门店，请使用商家账号注册」**。
- 中台接口**从不读取**请求参数里的 `store_id`，买家在首页切店也**不会**改变商家中台看到的那家店。

### 2.2 站点地图

```
/tab 常驻层（TabBar 四个 tab 由 TabStack 同时挂载，切换不重挂 → 不闪屏）
├── /shop          首页（H5 主入口）
├── /cart          购物车
├── /notifications 消息
└── /profile       我的
        │
        ├── /search            搜索（空态：热搜 + 分类网格 / 结果态）
        ├── /category/:id      类目（一级详情 + 子类目筛选）
        ├── /product/:id       商品详情
        │        └── /checkout            结算 → 唤起支付 → /payment/result
        ├── /orders            我的订单（On going / History）
        ├── /my-profile        资料编辑
        ├── /favorites         收藏（购物车行式）
        ├── /vouchers          优惠券 + 兑换码
        ├── /addresses         收货地址
        ├── /help              帮助中心（FAQ）
        │        └── /chat     在线客服
        ├── /settings          设置（语言 / 评分 / 条款 / 隐私）
        └── /admin             运营中台（仅商家）
                 ├── /admin/orders            订单处理看板
                 │      └── /admin/orders/:id 订单详情与状态推进
                 ├── /admin/carousel          轮播配置
                 ├── /admin/categories        类目管理
                 ├── /admin/products          商品管理
                 │      ├── /admin/products/new
                 │      └── /admin/products/:id/edit
                 ├── /admin/media             素材库
                 └── /admin/store             门店资料（从「概览」进入，不在侧栏）

登录前：/onboarding · /login · /register
遗留：  /users（SSO 示例页，仍在路由里；`*` 兜底目前指向它 → 见 §10 已知问题）
```

---

## 3. 页面原型清单

### 3.1 账户流（登录前）

| 路由 | 设计稿节点 | 原型要点 | 数据来源 / 业务 |
|------|-----------|---------|----------------|
| `/onboarding` | `C8f31WfGTa` | 全屏无页头；右上角页码指示器（当前页 26×8 绿胶囊，其余 8px 圆点）；主图 + 标题 + 描述 + Login / Sign up 双 CTA | `GET /api/onboarding/slides`；完成后 `POST /api/onboarding/complete` |
| `/login` | `Uxph5YiA7t` | 下划线式字段（`UnderlineField`），标题不在页头内（页头只出回退箭头）；Forgot Password 红色下划线文字；账号框 label「Email / Mobile」——**邮箱、用户名、手机号三种都能登录**，前端不限格式由后端判定 | `POST /api/login` → HttpOnly Cookie + CSRF；成功 `navigate('/shop', {replace:true})` |
| `/register` | `MA1FcG-1ER` | 买家 / 商家双 pill 切换；选商家时追加「门店名称 + 门店地址」两栏与「用我的当前位置作为门店坐标」按钮；手机号限中国大陆 11 位（`^1[3-9]\d{9}$`） | `POST /api/register`（公开，无会话）；服务端 `ValidateStore` 校验门店名 2–30 字、地址 ≥6 字；商家注册即建店并回 `data.owned_store_id` |

> **注册页不链去 `/settings`**（那是受保护路由，未登录会被弹回登录页），条款与隐私在页内展开 `LEGAL_COPY` 面板。

### 3.2 下单流（核心）

| 路由 | 设计稿节点 | 原型要点 | 数据来源 / 业务 |
|------|-----------|---------|----------------|
| `/shop` 首页 | `c6pfnDn51g` | 问候 + 头像 + **门店切换按钮**；Banner 自动轮播（轨道 `translateX` 滑页，315×113 圆角 15）；类目 43px 圆底 chip 横滑（5 格半）；Exclusive Offer / Best Selling 两个版块；猜你喜欢无限滚动 | `GET /api/shop/home` 一次拉齐（greeting / store / carousel / sections / recommend）；类目走 `/shop/categories`；版块与推荐位都走 `/shop/products?section=…` |
| `/search` 搜索 | `VhGSFpBoFG`（空态）+ `M70nQfpLgU`（结果） | 双态一页：空态出热搜标签 + 149×154 分类方卡网格；输入后切结果列表 + 无限滚动 | `GET /api/shop/search/hot` + `GET /api/shop/products?q=…`（**与首页/类目同一个接口，只是过滤字段不同**） |
| `/category/:id` 类目 | `cFa6cBmD5Q` | 一级类目详情 + 顶部子类目筛选条；切子类目只换过滤参数 | `GET /api/shop/categories/{id}` + `/shop/products?category_id=&subcategory=`；用 `usePlaceholderData` 压闪屏 |
| `/product/:id` 详情 | `bTzUj6MJiG` | 多图 + 营养条 + 描述 + 相关推荐；底部吸底栏带磨砂（`bg-white/70 backdrop-blur-[14px]`） | `GET /api/shop/products/{id}`（含 `related`、`collected`）；心形 `POST /api/shop/favorites`；加购 `POST /api/cart/items` |
| `/cart` 购物车 | `yEMojet72x` | 行 = 勾选框 + 图 + 名称/规格 + 数量步进器；底部全选 + 合计 + 去结算 | `GET /api/cart`（行项目带 `available`/`max_qty`）、`PUT /api/cart/selection`、`PATCH/DELETE /api/cart/items/{id}` |
| `/checkout` 结算 | `pYRQwhhHjF` | 地址卡 + 商品行 + 券选择 + 金额明细（小计/优惠/运费/应付）+ 备注 + 支付方式（仅支付宝 / 微信） | `POST /api/cart/checkout-preview`（带 `voucher_rejected_reason`）→ `POST /api/orders` → 支付模块 |
| — 支付弹层 | `SKh1XGuRfL` / `q721g3bZFw` | 订单成功/失败两态走同一个 `ResultSheet`；收银台在 `frontend/src/payment/components/PaymentSheet.jsx` | `POST /api/payment/prepay` → `POST /api/payment/launch/{id}`（整页唤起）→ 轮询 `GET /api/payment/query/{id}` |
| `/payment/result` | 唤起回跳落地页 | 独立路由，浏览器整页跳回来时按 `?payment_id=` 恢复并继续轮询，不依赖前端内存状态 | 同上 |

### 3.3 订单与履约

| 路由 | 设计稿节点 | 要点 | 业务 |
|------|-----------|------|------|
| `/orders` | `IovVV9IXXd` | On going / History 双 tab，行带状态徽标与金额合计，懒加载 | `GET /api/orders?tab=`；`POST /api/orders/{id}/cancel`（回补库存与券）；`GET /api/orders/{id}/track`（4 节点轨迹） |
| 订单详情轨迹 | `yDATa6QoOE` **尚未还原** | 目前轨迹在列表行内展开 | `OrderStep{code,label,at,done}` 由状态生成 |

### 3.4 「我的」与支撑页

| 路由 | 设计稿节点 | 要点 | 业务 |
|------|-----------|------|------|
| `/profile` | `Sz-QR8qFqD` | 头部资料卡 + 分组入口行，行右侧显示真实数值（订单数 / 收藏数 / 券数 / 默认地址 / 未读数 / 语言 / 平均分）；商家多一行「运营中台」；底部退出登录 | 聚合各 store；`GET /api/auth/me` |
| `/my-profile` | `sro_FGWgbC` | 5 张资料卡 + 铅笔行内编辑；手机号按大陆 3-4-4 分组显示（`138 0013 8000`），不合规的存量旧号原样显示不伪装；密码强度与资料完整度 | `PUT /api/profile`、`GET /api/profile/completeness` |
| `/favorites` | `HRktBYJjx-`（MCP 未读到，几何待复核） | **购物车行式**：勾选框 + 70×70 图 + 名称/价 + 行尾 `×`；售罄行带红色「库存不足」标记且**不可勾选**；下方「全选 (N) … 合计 $」；底栏只有一个「一键加入购物车 (N)」 | `GET /api/shop/products?favorite=true`（跨门店，收藏跟人走）、`DELETE /api/shop/favorites`、`POST /api/cart/items/batch` |
| `/vouchers` | `fVK-efyqxy` | 兑换码输入 + Apply；券卡 315×99 带左右圆缺口与竖虚线；可用/差额实时按车金额算 | `GET /api/vouchers`、`/vouchers/available?amount=`、`POST /api/vouchers/redeem` |
| `/addresses` | `iti-MSKzdJ` | 卡片 319×83，名称 + 两行地址；`+ Add`；编辑 / 删除 / 设为默认 | `GET/POST/PATCH/DELETE /api/addresses`、`PUT /{id}/default` |
| `/notifications` | `tg5lKXSujV` | 42px 圆底徽标 + 两行文字 + 时间列 + 未读点；页头「全部已读」 | `GET /api/notifications`、`/unread-count`、`POST /read`、`/read-all`；下单后服务端 `PushOrderNotice` |
| `/help` | `ZvkHfSL93T` | 4 条 FAQ 折叠行；每条带业务跳转 CTA；有用/没用 →「已解决 / 待跟进」+ `N/4 个问题已解决`；右下 73×73 FAB 展开客服浮层 | `GET /api/help/faqs`、`POST /faqs/{id}/vote`、`GET /api/support/status` |
| `/chat` | `OJq4vCCCMN` | 双气泡（用户右 / 客服左 + 绿圆头像）；发图；离线时段在底部出提示条 | `GET/POST/DELETE /api/chat/messages`；`botReply()` 按 FAQ 关键词命中（最长关键词优先） |
| `/settings` | `9RqniPG-6p` | 4 行手风琴：Language / Rate us / Terms / Privacy | `GET/PUT /api/settings`、`POST /settings/ratings`、`GET /api/legal/{key}` |

### 3.5 运营中台（仅商家）

| 路由 | 模块 | 能力 | 接口 |
|------|------|------|------|
| `/admin` | 概览 | 商品数 / 类目数 / 轮播数 / 进行中订单四张卡 + 六个快捷入口（含「门店资料」） | `GET /api/admin/stats` |
| `/admin/orders` | **订单处理** | 状态看板计数（未支付 / 待备货 / 待取 / 已送达 / 已取消 + 今日新增 + 今日已收金额）；关键词（单号 / 收货人 / 手机）、支付状态、日期区间筛选；分页倒序，买家信息联表回填 | `GET /api/admin/orders`、`/orders/summary` |
| `/admin/orders/:id` | 订单详情 | 商品行 + 收货与买家快照 + 支付单列表 + 操作留痕；推进状态 / 取消 / 备注 / 补写配送员与运单号 | `GET /orders/{id}`、`PUT /status`、`POST /cancel`、`PUT /remark`、`PUT /shipping` |
| `/admin/carousel` | 轮播配置 | 增删改 + 排序 + 上下架（sort 数值越大越靠前） | `GET/POST/PUT/DELETE /api/admin/carousel` |
| `/admin/categories` | 类目管理 | 类目 CRUD + **子类目全量替换** + 商品数统计 | `GET/POST/PUT/DELETE /api/admin/categories` |
| `/admin/products` | 商品管理 | 发品 / 改品 / 上下架 / 删除；表单含价格、单位、多图、类目、子类目、首页版块、库存、排序、描述、营养 | `GET/POST/PUT/DELETE /api/admin/products`、`PUT /{id}/status` |
| `/admin/media` | 素材库 | 上传 + 列表 + 删除；`ImagePicker` 作为选择器被商品表单与轮播复用 | `POST/GET /api/uploads`、`DELETE /uploads/{id}` |
| `/admin/store` | 门店资料 | 改名称 / Logo / 电话 / **门店地址** / 坐标 / 配送半径 / 起送金额 / 公告 / 营业状态；字段留空表示不改，坐标需成对给 | `GET/PUT /api/admin/store` |

中台整体是「**纯 Tailwind 断点**」实现，PC 保持多栏，移动端塌成单栏，未引入独立组件。

---

## 4. 核心业务流程

### 4.1 买家下单主流程

```
选店 → 浏览 → 加购 → 勾选 → 结算试算 → 建单 → 建支付单 → 唤起支付 → 回跳/轮询 → 轨迹
  ①      ②       ③       ④        ⑤          ⑥        ⑦          ⑧           ⑨
```

| 步骤 | 动作 | 服务端裁决点 |
|------|------|-------------|
| ① | 首页点门店名 → 附近门店面板 → 选店 | `PUT /shop/stores/selection`；`status=closed` → 422；坐标缓存到会员，回 `out_of_range` |
| ② | 所有列表共用 `GET /shop/products`，只换过滤字段 | `publishedFilter(storeID)` 只回本店已上架商品 |
| ③ | 加购 / 批量加购 | `mergeLine`：上架校验 + 跨门店拦截 + **`existing+qty > stock` 累计库存校验**，任一不合规**整批不生效** |
| ④ | 勾选与取消 | `PUT /cart/selection` 只作用当前门店的行 |
| ⑤ | 试算 | `checkout-preview` 返回地址 / ETA / 券拒用原因；金额全部服务端算 |
| ⑥ | `POST /orders` | 快照 `store_id`+`store_name`+收货人；条件更新 `stock >= qty` 扣库存 + 累计销量；占用券；从车上摘掉已结算行 |
| ⑦ | `POST /api/payment/prepay` | 同单同渠道的未过期 pending 单**直接复用**；先向渠道预下单成功才落库 |
| ⑧ | `POST /api/payment/launch/{id}` | 按 UA 决定 `form` / `redirect` / `jsapi` / `qrcode` 四种唤起形态 |
| ⑨ | `GET /api/payment/query/{id}` 轮询 | 读取时惰性收敛：超时 → 渠道关单 + 置 closed；真实渠道再主动查单一次；三条入口（模拟回调 / 公网回调 / 主动查单）全部汇到 `settle` |

### 4.2 商家履约流程

```
买家下单（status=accepted / payment_status=unpaid）
   ↓ 回调或查单收款成功 → 订单 payment_status=paid + paid_at + txn_no，并推一条订单通知
中台「订单处理」看板看到新单
   ├─ accepted → ready     「备货完成」
   ├─ ready    → accepted  误点可退回纠正
   ├─ accepted/ready → delivered 「确认送达」（终态）
   ├─ 任意非终态 → cancelled  取消并回补库存/券（终态）
   └─ 补写配送员姓名 / 电话 / 运单号 + 内部备注
每一步都写 OrderAdminLog（action / note / operator / at），买家侧只读
```

### 4.3 注册开店流程

```
/register 选「商家」→ 填 门店名称 + 门店地址（可选：用我的当前位置作为门店坐标）
   → POST /register（account_type=merchant）
   → 服务端 ValidateStore → 建会员 + 建门店 + 设为该账号 default_store_id
   → 回 data.owned_store_id → 跳 /login
登录 → Profile 出现「运营中台」→ 去 /admin 发品
```

**当前无入驻审核**（代码里留 `TODO(商家入驻)`）：任何合法邮箱注册即可开店。

---

## 5. 业务规则（单一事实来源，前后端必须一致）

| 规则 | 事实 | 出处 |
|------|------|------|
| 一单一店 | `store_id` 下沉到 `products`/`categories`/`carousels`/`orders`/`carts`；购物车按行归属；**切店不丢车**（别家店的行只是隐藏） | `services/cart_service.go`、`models/trade.go` |
| 门店地址 ≠ 收货地址 | `Store.address` 是卖家发货店址（注册 `store_address` 采集、中台「门店资料」维护）；`/api/addresses` 只服务买家收货与结算，**两者互不派生** | `services/member_service.go`、`docs/api.md §3.8` |
| 中台作用域 | 只认 `AdminShopScope` 注入的 `storeID`，不读请求参数；无门店账号 403 | `controllers/admin_scope.go` |
| 账号类型 | `members.account_type = buyer / merchant`，注册时落库并随 `/api/auth/me`、`PUT /api/profile` 回显；`merchant` 恒有 `is_admin=true`。存量账号（种子、SSO 建档）文档里没有该字段，出参由 `markMerchant` 按「名下有无门店」补全 | `models/account.go`、`controllers/context.go markMerchant` |
| 手机号 | 中国大陆 11 位 `^1[3-9]\d{9}$`（2026-09-22 由马来西亚 `^60\d{9,11}$` 换掉，属破坏性变更：存量旧号登录不受影响，再保存时会被拦）。**校验、查重、入库统一走 `NormalizeMobile`**，`+86`/空格/连字符先归一成纯数字，避免同号双账号；`mobile` 唯一索引是小程序账号合并的主键 | `services/member_service.go` |
| 登录凭据 | 邮箱 / 用户名 / **手机号** 三者任一 + 密码；`FindByAccount` 的 `$or` 一次查完，先 MySQL SSO 后台账号后 Mongo 会员，优先级不变 | `services/auth_service.go Login`、`services/member_service.go FindByAccount` |
| 商品列表唯一入口 | 搜索 / 类目 / 首页版块 / 收藏全部是 `GET /api/shop/products` + 过滤字段（`q`/`category_id`/`subcategory`/`section`/`favorite`/`sort`），因此分页、排序、`collected` 标记行为天然一致 | `services/shop_service.go` `ListProducts` |
| 收藏跨门店 | `favorite=true` 时**不限门店**（收藏跟人走），跨店加购仍由购物车侧拦下 | 同上 |
| 库存 | 加购累计校验；下单条件扣减；取消/关单回补；单行上限 20、批量上限 100 | `mergeLine` / `deductStock` / `restoreStock` |
| 金额 | 服务端计算，一律字符串十进制 + `currency`，前端只做展示与拼接 | `models/*.go` 顶部注释、`ComputeTotals` |
| 运费 | 选中金额 ≥ **20.00** 免运费，否则固定 **5.00** | `services/cart_service.go` 常量 |
| 优惠券 | 三类：`percent`（按比例抵扣）、`fixed`（固定额，不超过小计）、`shipping`（免运费，不产生折扣额）；已使用 / 未达门槛会在试算里回拒用原因；下单时占用，取消时释放 | `applyVoucher`、`voucher_service.go` |
| 订单状态机 | `accepted → ready → delivered`，`ready` 可退回 `accepted`，`delivered`/`cancelled` 终态；`tab = ongoing(accepted,ready) / history(delivered,cancelled)` | `services/admin_order.go`、`frontend/src/constants/adminOrder.js` **两处必须同步** |
| 支付 | 渠道开关 `PAY_PROVIDER = mock / alipay / wechat`；订单可选支付方式仅 `alipay`/`wechat`；支付结果**只写订单新增字段**（`payment_status`/`payment_txn_no`/`paid_at`），不动订单状态机 | `payment/settings.go` |
| 支付安全 | 密钥只从环境变量进，不落库、不写日志、不出现在任何响应里；真实渠道下 `mock_credential` 恒为空；缺省假值一律含 `MOCK` 字样；回调金额与支付单快照、订单总额**双向复核**，对不上绝不信 | `payment/settings.go`、`payment/service.go settle()` |
| 支付幂等 | `settleDoc` 条件更新只允许 `pending` 迁移一次；重复回调 / 重复回跳回放既有结果 | `payment/service.go` |
| 订单快照 | 建单时快照门店名、地址、收货人与手机，之后改门店资料或删地址都不影响历史订单 | `services/order_service.go Create()` |
| 客服在线 | 09:00–21:00 **GMT+8**，判定在服务端以保证多端一致 | `services/help_service.go` |
| 会话与安全 | HttpOnly Cookie 的 JWT + `X-CSRF-Token`（取自 `sso_csrf` cookie）；`/api` 分组限流 **300 次/分钟/IP**；`/uploads` 与公网回调不挂 protected | `routers/router.go` |

---

## 6. 功能能力矩阵

### 6.1 买家侧（H5，已全部接通真实接口）

账号与引导 · 附近门店与选店（浏览器定位 + 失败静默兜底） · 首页轮播/类目/版块/推荐 · 关键词搜索与热搜 · 类目与子类目筛选 · 商品详情与相关推荐 · 收藏（单条切换 + 批量取消 + 一键加购，售罄标记） · 购物车（增删改 / 数量 / 全选 / 单店隔离 / 库存与下架拦截） · 优惠券（列表 / 按金额可用 / 兑换码） · 收货地址（增删改 / 默认） · 结算试算 · 下单 · 支付宝 / 微信唤起支付 + 结果轮询 · 订单列表与轨迹 · 取消订单 · 通知（未读计数 / 单条已读 / 全部已读） · FAQ 与投票 · 在线客服会话（关键词自动回复 + 发图 + 在线时段） · 资料编辑与完整度 · 设置（语言 / 评分 / 条款 / 隐私） · 骨架屏与失败重试（`QueryError`） · 滚动位置记忆 · 常驻 tab 无闪屏

### 6.2 商家中台

概览统计 · 订单看板计数与今日营收 · 订单多维检索 · 状态推进 / 取消 / 备注 / 配送信息 / 操作留痕 · 轮播配置 · 类目与子类目 · 商品发布与上下架 · 素材上传与库 · 门店资料（含门店地址、坐标、配送半径、起送金额、营业状态）

### 6.3 平台与技术能力

统一响应格式与错误码 · 全量接口 swagger（`/swagger/*`）· Mongo 种子脚本 · 生产环境 Go 静态托管前端产物 + 前端路由兜底 · 上传素材本地目录托管 · 支付模块独立（后端 `payment/`，前端 `src/payment/`，均不 import 商城业务层，通过 `OrderGateway` 与注入接线）

---

## 7. 数据模型

20 个集合（`config/mongo.go`）：

```
members ─┬─ stores(owner_member_id, 坐标/半径/起送/状态)
         ├─ carts(member_id + lines[{product_id, store_id, qty, selected}])
         ├─ favorites(唯一索引 member_id+product_id)
         ├─ vouchers / redeem_codes
         ├─ addresses
         ├─ orders(store_id + items[] + steps[] + admin_logs[] + 支付回写字段)
         ├─ payments(order_id/provider/amount/status/trade_no/expired_at)
         ├─ notifications / chat_messages / member_settings
         └─ onboarding / legal_docs / uploads / faqs
stores ──┬─ categories(store_id) ── subcategories(category_id)
         ├─ carousels(store_id)
         └─ products(store_id, category_id, subcategory_id, sections[], stock, sales, sort, status)
```

---

## 8. 接口概览

完整清单与出入参见 [`api.md`](./api.md)。按域分组：

| 域 | 前缀 | 说明 |
|----|------|------|
| 认证与账号 | `/api/login` `/logout` `/register` `/auth/*` `/onboarding/*` `/legal/*` | 注册与找回密码是公开接口 |
| 店铺与商品 | `/api/shop/*` | 含 `stores/nearby`、`stores/selection`、`favorites`、`search/hot`；**商品列表唯一入口 `/shop/products`** |
| 购物车 | `/api/cart/*` | 含 `/items/batch`（收藏页一键加购）与 `/checkout-preview` |
| 交易 | `/api/vouchers/*` `/api/addresses/*` `/api/orders/*` | 订单支持取消与轨迹 |
| 支付（独立模块） | `/api/payment/*` | `prepay` / `query` / `launch` / `mock-notify` 挂会员组；`notify/:provider` 与 `mock/launch` 是公网回调与唤起落点，不挂 protected |
| 支撑 | `/api/notifications/*` `/api/help/*` `/api/chat/*` `/api/settings` `/api/profile*` `/api/uploads*` `/api/support/status` | — |
| 运营中台 | `/api/admin/*` | 全部经 `AdminShopScope`，作用域锁自家门店 |

---

## 9. 优点

1. **闭环完整**：注册（含开店）→ 选店 → 浏览 → 加购 → 结算 → 支付 → 履约 → 中台处理 → 取消回补，全程无断点，没有一处靠前端假数据撑场面。
2. **数据隔离做在正确的层**：门店作用域写在服务端的 filter 里（`publishedFilter(storeID)`），不是前端过滤，越权面天然小；中台另有一道 `AdminShopScope` 收口。
3. **金额与状态全部服务端裁决**：小计、优惠、运费、应付、轨迹、状态迁移都在 Go 侧算，前端只展示，改前端改不出资损。
4. **支付是可替换的独立模块**：渠道差异收敛进 provider 接口，前后端都物理隔离（`payment/`、`src/payment/`）；接真实渠道只改环境变量与密钥，**订单侧与前端流程一行不用动**（这正是用户当初要求「整个支付流程不能变，后面可以直接替换」的落点）。
5. **支付状态机稳**：三条结算入口汇到同一个 `settle`，条件更新保证只迁移一次，回调金额与订单总额双向复核，超时惰性关单 + 主动查单补掉「渠道已收款但回调没到」的窗口。
6. **列表行为一致、维护不分叉**：搜索 / 类目 / 版块 / 收藏是同一个接口，分页、排序、`collected` 天然同步；新增一个列表页不新增一套后端。
7. **移动端体验细节到位**：常驻 tab + 滚动记忆 + 骨架屏 + `isPlaceholderData` 降透明，切页切筛选不闪屏；页头统一 92px sticky；回退语义统一（回上一级，无则回首页，tab 页无回退）。
8. **异常态有兜底**：定位失败静默降级、`QueryError` 重试、售罄行不可勾选并给出原因、下架商品跳行不阻塞整车渲染。
9. **文档与契约齐全**：`api.md` + `payment-integration.md` + `database.md` + swagger，前后端与后续接手人都能冷启动。
10. **安全默认值合理**：CSRF + HttpOnly Cookie + 限流；缺省假凭据一律含 `MOCK`，真实渠道下 `mock_credential` 恒空，密钥不外泄。

---

## 10. 缺点与风险

按严重度排序，**每条都指向具体文件**，不做模糊描述。

### 高（影响资金 / 数据正确性）

| # | 问题 | 位置 |
|---|------|------|
| H1 | **下单不校验库存充足**：`Create` 直接把车上的 `qty` 传给 `deductStock`，而 `deductStock` 用的是 `stock >= qty` 条件更新却**忽略了 MatchedCount** —— 库存不足时不报错、不扣减，订单照样建成功（超卖 + 账实不符）。购物车里的 `available` 也早已过期 | `services/order_service.go:246` `deductStock` |
| H2 | **改数量不校验库存**：`SetQty` 只截到 `maxCartQty=20`，不比对 `product.Stock`，可把某一行改到超过库存再下单（配合 H1 就是一条完整的超卖路径） | `services/cart_service.go SetQty` |
| H3 | **支付仍是 mock**：`PAY_PROVIDER` 缺省 mock，没有真实收银台、**没有退款 / 对账 / 掉单补偿**（订单上有 `refund_status` 字段但无接口）；上线前必须补真实渠道 + 对账任务 | `payment/settings.go` |
| H4 | **无幂等下单**：连点「Place Order」会建两单并扣两次库存；`order_no` 用秒级时间戳拼（`FM` + `20060102150405`），同秒并发直接撞号，而 `orders` 上**没有 `order_no` 唯一索引**（只有 `member_id+tab` 与 `store_id+status`），撞号也不会报错 | `services/order_service.go Create`、`config/mongo.go EnsureIndexes` |

### 中（业务完整度）

- **商家入驻无审核**：任何邮箱注册成商家即开店（`TODO(商家入驻)`），意味着中台是个谁都能进的公开后台。
- **`min_order_amount` 与 `out_of_range` 只展示不拦截**：门店起送金额与配送半径算出来了，但下单链路里没有任何一处用它拒绝，超出配送范围照样能下单。
- **无售后 / 退款 / 部分退**：取消只在未送达前可用，送达后没有任何入口。
- **无评价与评分体系**：商品没有 reviews/rating，`/settings` 的 Rate us 是评 App 不是评商品。
- **物流是假的**：`Track` 返回的骑手是写死的 `"FreshMart Rider"` + 客服电话，运单号靠中台手填，无三方物流对接。
- **新商家开店即空店**：名下门店没有类目没有商品，首页会出现「只有版块标题没有卡片」的空态，缺「先去中台发品」引导（已向用户提过，未决）。
- **催单 / 改址 / 再次购买（reorder）都没有**。

### 低（工程与体验债）

- **素材上传走本地目录** `./uploads`：多实例部署或容器重建会丢文件，无对象存储 / CDN / 图片压缩。
- **单币种硬编码 USD**（`cartCurrency`），但门店 `min_order_amount`、商品价格都带 `currency` 字段，混币种时整车金额会错。
- **`/users` 遗留 SSO 示例页仍在路由里，且 `*` 兜底 `Navigate to="/users"`** —— 与既定约定「无上级回首页」矛盾，输错网址会被带到一个不该存在的页面。
- 通知无推送：只在进入页面 / 轮询时看到，锁屏和外链拉不醒用户。
- 客服自动回复是关键词规则，不是真人；`useVouchers` 写的是 `queryFn: fetchVouchers`，react-query 会把 context 对象当第一个实参传进去，而 `fetchVouchers(amount)` 又把它当金额拼进 params，**实际发出的是 `?amount[queryKey][0]=vouchers&amount[meta]=…` 这种脏请求**（`hooks/useShopData.js:155` + `api/index.js:307`）。目前不影响展示（`MyVoucher.jsx` 用本地购物车金额自己重算 `usable`），但服务端返回的 `usable`/`gap_amount` 恒按金额 0 计算，谁一旦直接消费就会全错。
- 搜索无联想、无价格/销量筛选、无排序 UI（后端 `sort=sales` 已支持）。
- 商品无多规格 SKU、无单位换算、无限购数。
- 前端无 ErrorBoundary、无埋点，`document.title` 仍写着「SSO 统一认证中心」。
- 语言设置只存不用，界面文案中文硬编码，未做 i18n。
- `/favorites` 的几何与色值未按 `HRktBYJjx-` 复核（当时 MCP `NO_PLUGIN`），不能当成设计稿事实。

---

## 11. 未做清单（建议顺序）

1. 补 H1/H2/H4：下单前校验 `qty <= stock` + 检查 `MatchedCount`，不足则整单回滚；下单幂等键 + 单号加随机段；`SetQty` 走同一套库存校验。
2. 真支付渠道接入（支付宝手机网站 + 微信 H5/JSAPI）与对账 / 退款；`PAY_PROVIDER` 切正式 + 公网 HTTPS 回调。
3. 中台补：商家入驻审核、售后 / 退款单、库存预警、优惠券发放与活动配置。
4. 结算侧启用 `min_order_amount` 与 `out_of_range` 拦截。
5. 素材迁对象存储；商品评价；新商家开店引导。
6. 前端清理：删 `/users`、把 `*` 兜底改回 `/shop`、`document.title`、i18n、ErrorBoundary、`useVouchers` 的 `queryFn: () => fetchVouchers()`。
7. 设计复核：`/favorites`（`HRktBYJjx-`）、订单详情轨迹（`yDATa6QoOE`）、找回密码两屏（`ihtTti_11S` / `dNt1hrNCKm`）。

---

## 12. 小程序 / App 复用与改造准备

> **本章是准备材料。** 其结论已展开成实施方案：[`miniprogram-plan.md`](./miniprogram-plan.md)（复用清单、后端改造点、分期与前置条件）。2026-09-22 状态更新：该方案**已拍板并开工**（分支 `feat/miniprogram-p2`），H5 侧唯一受影响的规则是手机号改为大陆校验并可用于登录（方案 §6.1）。

### 12.1 可以直接复用（不需要重写）

| 资产 | 为什么能复用 |
|------|-------------|
| **全部 `/api/*` 接口与业务规则** | 后端不感知端，端只换 `LaunchEnv` 与 UA。金额 / 库存 / 状态机 / 门店作用域全在服务端裁决 |
| **`payment/` 后端模块** | 渠道差异已经抽象成 provider；`Launch` 契约**已经预置了小程序 / App 需要的形态**：`form` / `redirect` / **`jsapi`** / **`qrcode`**。`LaunchEnv` 已带 `Client`（端标识，取 `X-Client` 头）与 `OpenID`（服务端按会员档案查库，不接收客户端传参）—— 小程序支付要的 `jsapi + openid` 在接口层已就位 |
| **`models/*.go` 出参结构** | 前端换端只换渲染层，JSON 契约不变 |
| **业务规则文档（§5）** | 直接作为小程序 / App 的需求基线 |
| **设计稿与已还原几何** | 375×812 屏，小程序 rpx 与 App dp 可按 2x / 3x 直接换算 |
| **图片资产与配色 token** | `#00b861` 主按钮绿 / `#f9f8f6` 卡底 / `#f4f5f7` 分隔线等一套已在 `frontend/src/assets` 与 Tailwind 里固化，可整包搬 |

### 12.2 换端必须新增

**小程序（微信 / 支付宝）**

1. 登录：`wx.login` → `code2session` 换 openid + unionid，**与现在的邮箱密码账号体系做绑定/合并**（`members` 已有 `wx_openid` / `alipay_user_id` 两列，P2a 落；`wx_unionid` 与两条唯一索引随 P2b 落，合并策略按「只认平台授权手机号」）。
2. JSAPI 支付：`LaunchEnv.OpenID` 必须有值 → 后端 `wechat.go` 的 JSAPI 分支已按 `X-Client: mp_wechat` 强制命中，`openid` 由服务端查会员档案注入（`payment.PayerFunc`），缺的是授权登录写入档案的那条链路（P2b）。
3. 收货地址：小程序 `wx.chooseAddress` 可以覆盖 `/api/addresses`，无需新增接口。
4. 定位：`wx.getLocation` 替换 `utils/locate.js`（后者返回 `null` 的兜底语义保持不变即可对接同一套 `/shop/stores/nearby`）。
5. 订阅消息替换现在的「进页面才看到的站内通知」。
6. 类目审核与资质（生鲜 + 支付资质）。

**App（iOS / Android）**

1. 支付走**开放平台 App 授权**：支付宝 `alipay.trade.app.pay`、微信 APP 支付，都要**新增 provider 分支与 kind（如 `scheme` / `app_params`）**；`Launch` 契约目前是「前端按 kind 分支执行，不拼任何渠道参数」，因此加一种 kind 不影响既有前端。
2. 账号：手机号一键登录 / 第三方登录，同样需要绑定现有 `members`。
3. 推送通道（APNs / FCM）对接通知，服务端已保留 `notifications` 集合，缺发送侧。
4. 素材上传需支持相机、分片与压缩 —— 这也是把上传迁对象存储的动因。
5. 版本与灰度、离线包 / 热更新策略。

### 12.3 换端前要先对齐的契约

- **鉴权载体**：`middleware/jwt.go extractToken()` 支持 `Authorization: Bearer`（Cookie 缺失时回落），登录响应体也回 `token`。**CSRF 已按载体分流**（2026-09-22 P2a）：`middleware/csrf.go` 在写操作里先问 `TokenCarrier(c)`，值为 `bearer`（无会话 Cookie 且带 Bearer 头）时放行 double-submit 校验——这套校验存在的唯一理由是浏览器会自动携带 Cookie，头不会被跨站自动携带，故无攻击面；Cookie 会话路径一字未改，且 **Cookie 与 Bearer 同时存在时按 Cookie 处理（仍要 CSRF 头）**，属 fail-closed。豁免清单仍是 4 条引导端点 + `/api/payment/notify/` 前缀，没有继续往里加路由。
- **`PaymentResult` 落地页**：现在靠整页 302 回跳 + `?payment_id=`。App 内是 scheme 回跳，小程序内是页面 `onShow` 查询 —— **轮询 `GET /api/payment/query/{id}` 这段逻辑是三端共用的核心，务必保持单一**。
- **域名与回调**：真实渠道要求公网 HTTPS 回调，`*_NOTIFY_URL` 目前缺省指向 `localhost`。
- **单号与时间**：`order_no` 用 UTC 时间戳拼，跨端展示与对账要确认时区口径（客服在线时段判定已是 GMT+8）。

### 12.4 建议的推进节奏（与既有约定一致）

```
P0（当前 H5）  ✅ 已完成闭环 —— 先按 §11 把 H1~H4 的资损项补掉
P1（真实支付）  接支付宝/微信 H5，保持「整个支付流程不变、只换参数」的既定约束
P2（小程序）    登录绑定 + JSAPI 支付 + 订阅消息，业务接口零改动
P3（App）       App 支付 kind + 推送 + 对象存储
```

用户已明确：**「等我把基本功能磨炼完成后 再上 p2/p3」**。2026-09-22 追加：基本功能闭环达成后，P2（小程序）方案 [`miniprogram-plan.md`](./miniprogram-plan.md) 已拍板开工（`feat/miniprogram-p2`，约 24–25 人日，含商家发品移植）；P3（App）未启动。

---

## 13. 运行与验证

```bash
# 后端（Go 1.14.2）
/usr/local/go/bin/go build -o /tmp/go-gin-dev . && /tmp/go-gin-dev   # :8080

# 前端（Node 22 + Vite 8，dev 代理 /api → :8080）
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
cd frontend && npm run dev                                            # :5173

# 质量闸门
/usr/local/go/bin/gofmt -l . && /usr/local/go/bin/go vet ./...
npx oxlint src && npm run build
/usr/local/bin/swag init -g main.go -o docs/swagger
```

- 依赖本地 docker 容器 `sso-mongodb`（:27017，库 `freshmart`）。
- ⚠️ **`seed` 会 drop 全部集合**，本地库里存有真实数据时禁止执行。
- ⚠️ 中台接口只对有门店的账号开放，本地演示需要用商家账号注册后再进 `/admin`。
