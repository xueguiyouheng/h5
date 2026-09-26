# 后端扩展性与熔断预案 · v1

> 状态：**方案文档，不改代码**（2026-09-23 用户要求：「后端这些可以暂时先不动，但是有些节点要提前归化」）。
> 本文回答三件事：① 并发过大时现在会先崩在哪；② 哪几处「节点」必须现在就归化成正确的形状（因为它们只是收口、不改行为，改晚一次就要连带重写业务）；③ 将来拆微服务时边界怎么划。
> 事实全部带 `文件:行` 为证，核对时间 2026-09-23，分支 `feat/miniprogram-p2`。契约口径见 `docs/api.md`，支付模块边界见 `docs/payment-integration.md`。

---

## 1. 一句话结论

现在的后端是**单实例、无请求级超时、无重试、无熔断、部分写路径不幂等**的形态。它撑得住当前的演示量级，但有两个硬伤决定了「加机器」这条路暂时走不通：

1. **有并发正确性问题**：库存扣减的条件更新结果被丢弃（§2 的 F1），加实例只会把超卖放大，不会把超卖变小。
2. **有进程内状态**：限流、微信 `access_token` 缓存、上传目录都在单进程里（F7~F9），多实例同时跑等于限流失效 + 素材 404。

所以顺序是固定的：**先补幂等与条件写的正确性 → 再让进程可多实例 → 然后才有限流/熔断/超时这套「抗负载」手段**。熔断和重试在没有幂等的前提下是危险的（会重复扣券、重复建支付单），这也是本文把「幂等键」列为必做归化节点的原因。

---

## 2. 现状盘点（事实，非评价）

| # | 事实 | 位置 | 后果 |
|---|---|---|---|
| F1 | 库存扣减用条件更新 `filter: {stock: {$gte: qty}}`，但返回值只接了 `err`，**`MatchedCount` 被丢弃** | `services/order_service.go:291-297` | 库存不足时更新没生效也不报错，订单照样创建 → 超卖 |
| F2 | 下单是先 `insertDoc(orders)` 再循环扣库存、占券、清购物车行，**任一步失败不回滚前序步骤**；全库无 `StartSession`/`WithTransaction`/`FindOneAndUpdate` | `services/order_service.go:238-252` | 中途失败留下「有单无库存」的脏单 |
| F3 | `order_no` = UTC 到秒的时间戳，且**无唯一索引** | `services/order_service.go:213`、索引表 `config/mongo.go:159-160` | 同秒并发即撞号；撞了也没索引拦 |
| F4 | 券的占用/释放是无条件 `$set`（不校验 `used:false`），兑换码「是否已用过」是先查后插 | `services/voucher_service.go:144-157`、`:66-114` | 一张券并发下可用两次；兑换码可重复兑换（`:107` 的 dup 分支背后没有唯一索引） |
| F5 | 购物车整文档 `ReplaceOne`（读—改—全量写） | `services/cart_service.go:39-61` | 多端同改一辆车时后写覆盖先写（H5 与小程序共用一个账号，这条已经在路上） |
| F6 | 支付侧：`settleDoc` 用 `UpdateOne({_id, status:"pending"})` + `ModifiedCount==1`，**这一步是原子且幂等的**；但订单回写是紧跟的另一个 `UpdateOne`，无状态守卫，两者不原子 | `payment/store.go:64-87`、`services/payment_gateway.go:59-62` | 极端情况下「支付单已 success、订单仍 unpaid」，需靠查询/回调收敛 |
| F7 | 限流中间件**存在**：固定窗口、按 IP、300 次/分钟、只挂 `/api`，计数在进程内存 | `middleware/ratelimit.go:17-46`、`routers/router.go:55` | 多实例各算各的；窗口边界可放过 2 倍流量 |
| F8 | 无请求级超时：每个数据操作自造 `context.Background()` + 8s，`c.Request.Context()` 从不透传 | `services/store.go:24-29`、`payment/store.go:18` | 客户端断开后服务端仍在跑；慢查询能把 goroutine 堆满 → 雪崩的正门 |
| F9 | 出网调用同步阻塞在请求路径、无重试无熔断：渠道 `Prepay/Launch/Query/Close`（10s 客户端）、微信 `code2session`/`phone`/`access_token`（8s 客户端，登录里串行 2~3 次） | `payment/client.go:22-61`、`services/mp_settings.go:30`、`services/mp_auth_service.go:212,256,302` | 渠道变慢 = 本站变慢（`GET /payment/query/{id}` 尤其致命：它本身就是前端每 3s 轮询的端点，里面还打一次渠道查单 `payment/service.go:116,278`） |
| F10 | Mongo 客户端只设了连接/服务发现超时，**没有池上限**；Redis 客户端 `PoolSize: 10` | `config/mongo.go:76-84`、`config/redis.go:26-35` | 高并发下 Mongo 连接数不受控；Redis 10 条连接是明确瓶颈（jti 黑名单与登录锁都走它） |
| F11 | RSA/EC 私钥每次签名都重新解析 PEM | `payment/crypto.go:53` ← `payment/alipay.go:153`、`payment/wechat.go:213,266` | 纯 CPU 浪费，签名 QPS 越高越明显 |
| F12 | 无优雅停机（`main.go` 直接 `r.Run`，无 `signal.Notify`/`srv.Shutdown`）、无 `/healthz`、无任何 metrics、无 request/trace id（`middleware/response.go:14` 名字留着但只写了 TODO） | `main.go:35-56`、`routers/router.go:48-55` | 滚动发布必掉请求；线上没有可观测面，熔断阈值也无从算起 |
| F13 | 服务层是包级单件互相 new：`OrderService` 构造时直接建 Cart/Address/Voucher/Member；`admin_order.go` 越过支付模块直接 decode 支付文档；全库只有两个接口（`payment.Provider`、`payment.OrderGateway`） | `services/order_service.go:23-30`、`services/admin_order.go:188`、`payment/gateway.go:27-32` | 依赖图不可见，拆服务时没有天然切口 |
| F14 | 读路径有副作用：`ResolveStore` 在解析门店时会写 `default_store_id` | `services/shop_store.go:191-223`（写在 `:210`） | GET 变写 → 不能安全重试，也和 §7 的读写分离冲突 |
| F15 | 素材落在本地 `./uploads/<YYYYMM>/`，静态托管同进程 | `services/upload_service.go:58-67`、`routers/router.go:51` | 多实例必错（A 实例上传、B 实例 404）；这也是小程序上线的硬前置 |
| F16 | 遗留 MySQL 仍连着，只有 `auth_service`/`user_service` 的 SSO 用户表在用；DSN 写死在源码 | `config/config.go:81`、`services/auth_service.go:147`、`services/user_service.go:59-169` | 商城主链路不依赖它，但它是一个真实的第二数据源 —— 拆分前必须回答「users 归谁」 |
| F17 | 已有事件挂点但是死代码：`PushOrderNotice` 零调用者 | `services/notification_service.go:118` | 好消息：需要异步解耦的地方已经预留了形状，只是没接线 |

**已经做对的**（不用重做）：支付模块自带独立的数据层与错误码、渠道差异收在 `Provider` 接口后面、状态收敛只有一个 `settle`、渠道回调幂等；JWT 黑名单与登录锁在 Redis；`settleDoc` 是条件更新；索引覆盖了一部分高频查询（`config/mongo.go:130-173`）。

---

## 3. 归化节点清单（本文的核心）

「归化」= **只把形状改对，不改行为**。判据：改完之后同样的输入必须得到同样的输出，且能用现有的接口级自测全量回归。凡是需要新增依赖（Redis 桶、MQ、对象存储）或需要压测调参的，一律不进本表、留给 §5 的分期。

| 节点 | 位置（现状） | 归化成什么 | 为什么现在做 | 风险 |
|---|---|---|---|---|
| **N1 请求上下文贯通** | 每层各自 `newContext()` 造 8s（`services/store.go:24-29`、`payment/store.go:18`） | 所有 service/store 方法首参统一 `ctx context.Context`，controller 传 `c.Request.Context()`；超时值仍取原常量 | 超时、熔断、追踪、优雅停机**全都挂在 ctx 上**。这一层不打通，后面每一项都要重写一遍方法签名 | 机械改动，面广（`services/` 20 个文件 + `payment/`）；编译期即可捕获遗漏 |
| **N2 出网口收口** | 渠道 HTTP `payment/client.go:30`、微信 `services/mp_auth_service.go:39` —— 两套 client、两种超时 | 一处 `httpclient.Do(ctx, spec)`，`spec` 带依赖名（`alipay`/`wechat`/`wxapi`）+ 超时 + 幂等标记 | 熔断/退避/重试的**唯一插桩点**；现在不收到一处，将来要在每个调用点各插一遍，必漏 | 低。行为等价，只需保持超时不变 |
| **N3 幂等键与唯一索引** | `order_no` 时间戳无索引（F3）、`payments` 无 `(order_id, provider, status)` 唯一约束、兑换无索引（F4） | 下单/预下单接受 `Idempotency-Key`（缺省则用服务端可推导的稳定键）落 `request_key` + **唯一索引**；`order_no` 改「日期前缀 + 随机尾」并加唯一索引 | 没有幂等就不能重试、不能有超时兜底、熔断半开态放过去的探针也可能重复扣。这是 F1~F4 那类问题的根因解，也是所有抗负载手段的**前置条件** | 唯一索引要在存量数据上先查重再建（本地库有数据，禁止用 seed 重建） |
| **N4 条件写口径** | 扣库存丢 `MatchedCount`（F1）、占券无守卫（F4）、购物车整档覆盖（F5）、订单回写无状态守卫（F6） | 一个 `deduct(...)`/`markUsed(...)` 之类的收口函数：条件更新 + 检查 `MatchedCount` + 不足即返回 `ErrOutOfStock`/`ErrVoucherUsed`；购物车行改成按行的 `$set`/`$inc` | 这是**资损项**，和 §4 的 H5 清单同源（`product-prototype.md` §10 的 H1/H2）。改完 F1/F4 就不再依赖「前端不给点」 | 中：错误路径要新增业务错误码，前端已有 toast 承载；不改状态机 |
| **N5 副作用出口（outbox 雏形）** | 下单后同步调通知（且 `PushOrderNotice` 根本没接，F17）；结算后同步回写订单（F6） | 副作用先落一个 `outbox` 集合的待发消息（同请求内写、进程内消费者投递），消费者接口与消息体按「将来能换成 MQ」的形状定义 | 拆微服务时唯一真正贵的东西是**同步跨服务调用变异步**。这里先换成「本地异步」，边界就划在真实的业务事件上 | 中：要保证 outbox 写与业务写在同一文档/同一次原子操作里，否则等于没做 |
| **N6 依赖边界显式化** | 包级单件互相 new（F13） | 一个装配处（`main.go` 或 `app.Deps`）列出「谁依赖谁」，service 从构造参数拿依赖；`admin_order.go` 改为走支付模块接口取支付信息 | `payment/` 已经是这个形状（`controllers/payment_module.go:15-17` 注入 `OrderGateway`/`MemberFunc`），照它抄即可。这张依赖图**就是**未来每个服务的进程清单 | 低。纯 DI，无行为改动 |
| **N7 读路径去副作用** | `ResolveStore` 在 GET 里写库（F14） | 选店改为显式的写端点（`POST /api/shop/select` 之类），读路径只读 | 一旦 N2/熔断开始重试，读路径的隐藏写就会造成真实数据变化；也是水平扩展前的必查项 | 低。需要前端配合改一次调用 |
| **N8 进程边界** | 无优雅停机、无 `/healthz`（F12）；限流与 token 缓存在进程内（F7、`services/mp_auth_service.go:284-288`） | `srv.Shutdown` + `signal.NotifyContext`（ctx 由 N1 贯通到最底层才有意义）；`/healthz` 探活；把「进程内状态」逐个登记并标出去向外（Redis/对象存储/配置中心） | 滚动发布不掉请求是「加实例」的第一前提。同时这份「进程内状态清单」本身就是一份可评审的清单，晚做会忘 | 低。停机要配合 LB 摘流，单独发一次即可 |
| **N9 可观测最小面** | 无 request id、`log` 直打、`ResponseMiddleware` 是空壳（`middleware/response.go:15-19`） | request id 中间件（进信封与日志字段）+ 结构化日志包装 + 每个依赖的时延/错误率计数 | 熔断阈值（错误率、慢调用比例、半开探针数）没有数据就只能是拍脑袋的常量 | 低。纯旁路 |
| **N10 数据归属表** | 集合混在同一个库，跨模块直读（F13 的 admin 直读 payments） | 一张「集合 → 归属域」的表（§7），代码上不越界读别人的集合 | 拆服务最贵的返工是「数据所有权没划清」。这条现在几乎零成本，事后成本极高 | 零。文档 + 一处 import 方向 |
| **N11 素材与静态** | 本地 `./uploads`（F15） | 上传走对象存储/CDN 的接口位（本地实现先留着），静态托管从应用进程里拆出 | 小程序上线的硬前置（`miniprogram-plan.md` §7），和扩展性是同一件事 | 低。但要配 CORS 与域名白名单 |

**不做清单（避免被当成待办）**：不引入 ORM/新框架；不在本轮做 MQ/服务网格/链路追踪平台；不做分库分表；不把 `payment` 拆成独立进程（它已经是独立模块，拆进程等 §5 的 S3）。

---

## 4. 风险分级（按「错了会怎样」排）

| 级别 | 项 | 触发条件 | 现状兜底 |
|---|---|---|---|
| **资损 P0** | F1 超卖、F4 券重复占用/兑换码重复兑换、F3 撞单号 | 同一热门商品并发下单；大促券；瞬时并发 >1 QPS | 前端裁剪与「售罄不给勾」——**不可信边界**，改包即绕过（本轮 `providerAllowedForClient` 就是同类问题的服务端收口，见 `docs/api.md` §7.1） |
| **雪崩 P1** | F8 无请求超时、F9 渠道慢即本站慢、F10 Mongo 无池上限 + Redis 10 连接 | 支付宝/微信网关 p99 抬到秒级；前端 3s 轮询叠加（每笔待支付都占一次渠道查单） | 只有渠道 10s / 微信 8s 的 client 超时，没有并发上限、没有熔断 |
| **一致性 P1** | F2 无事务、F6 支付与订单两次写 | 任一步中途失败 | `settle` 的条件更新 + 查询时收敛（`payment/service.go:107-116`） |
| **扩展性 P2** | F7 内存限流、F11 每次重解析私钥、F5 购物车覆盖 | 加第二个实例 / CPU 打满 | 单实例部署，暂时不暴露 |
| **运维 P2** | F12 无停机/探活/指标、F15 本地素材、F16 遗留 MySQL | 滚动发布、水平扩容、多端素材 | 无 |

---

## 5. 分期与触发阈值

| 期 | 内容 | 什么时候做 | 判据 |
|---|---|---|---|
| **S0 归化（只动结构）** | N1 ctx 贯通、N2 出网口收口、N6 依赖显式化、N10 归属表落文档 | **可与 P2e 并行，不阻塞任何功能** | 无阈值，纯工程收口；每步都要过 `go vet ./...` + `go build ./...` + 现有接口级自测全绿 |
| **S1 资损与幂等** | N4 条件写、N3 幂等键 + 唯一索引（先查重后建）、N7 读路径去副作用 | **上线真实渠道之前**（`miniprogram-plan.md` P2g 的前置） | 只要开始收真钱就是硬门槛 |
| **S2 抗负载** | N8 优雅停机 + `/healthz`、N9 request id 与指标、限流外置到 Redis 并按「端 + 用户 + 路由」分桶、每个依赖一个熔断/退避（挂 N2）、私钥解析缓存、Mongo 池上限与 Redis `PoolSize` 调参 | 有真实流量压测数据之后 | 建议起点：任一依赖 5xx 或超时率 > 5%（30s 窗口）开熔断；p99 > 1s 触发退避；单实例 RSS > 1.5G 或 QPS > 300 时开始加实例 |
| **S3 多实例与拆分** | N11 对象存储、N5 outbox 接 MQ、按 §7 边界拆进程 | 单实例扛不住 / 中台与买家端流量曲线明显分化 | 只有 outbox 队列积压持续增长、或某域的发布频率与其他域冲突时才拆 |

---

## 6. 熔断/限流/超时的统一口径（避免各依赖各写一套）

- **超时**：入口一个请求预算（建议 3s，走 N1 的 ctx 向下传递），下游每个依赖单独配额且必须小于预算；预算耗尽即返回，不再启动新的外呼。
- **熔断**：按依赖名分桶（`alipay`/`wechat`/`wxapi`/`mongo`/`redis`），滑动窗口错误率 + 慢调用比例双条件开；半开只放 1 个探针且必须带幂等键（这就是 N3 必须先于熔断的原因）。
- **退避**：只对**幂等且只读或对账安全**的操作重试 —— 查询、关单可以；预下单与扣款不可以（改成「等回调 + 对账」，即 `docs/payment-integration.md` 已有的收敛路径）。
- **降级**：渠道不可用时，结算与下单链路要能继续（只是「暂时不能支付」而非「整个站 500」）。当前实现里 `MongoEnabled=false` 会让全部商城接口 500（`services/store.go:57-65`），这条同样要按依赖分级而不是全局开关。
- **轮询解耦**：前端轮询的 `GET /api/payment/query/{id}` 不应每次同步打渠道（F9）。口径：读本地状态 + 到点才主动查单（时间阈值 + 单飞 `singleflight`），这是 N2 上第一个该加的东西。

---

## 7. 微服务预备：边界怎么划

| 域 | 现在的实现 | 归属集合 | 对外契约 | 拆分顺序 |
|---|---|---|---|---|
| 支付 | `payment/`（已独立：自带 store/错误/配置/接口） | `payments` | `payment.Provider`、`payment.OrderGateway` | **1**（已经是最像服务的一块，边界与幂等都已存在） |
| 交易（下单/购物车/地址） | `order_service.go`、`cart_service.go`、`address_service.go` | `orders`、`carts`、`addresses` | 订单写 + outbox 事件 `order.created`/`order.settled` | 2（先与支付解耦，依赖 N5/N3） |
| 商品与门店 | `shop_service.go`、`shop_store.go`、`admin_service.go` | `products`、`categories`、`stores`、`carousels`、`subcategories` | 只读为主，最易拆 | 3（拆了能立刻缓解 F10 的读放大） |
| 会员与认证 | `auth_service.go`、`member_service.go`、`mp_auth_service.go`、`services/user_service.go`（MySQL） | `members` + 遗留 MySQL `users` | 令牌签发 + 身份解析（`MemberFunc` 已是这个形状） | 4（先回答 F16「users 归谁」，把两套账号源合一） |
| 营销（券/兑换） | `voucher_service.go` | `vouchers`、`redeem_codes` | 条件写口径同 N4 | 5（流量小，且资损风险高，留在交易内更安全） |
| 内容/中台其余（客服、通知、设置、媒体库） | `help_*`、`notification_service.go`、`setting_service.go`、`upload_service.go` | `chat_messages`、`notifications`、`settings`、`uploads` | — | 不拆（中台场景就是电脑前，见 `miniprogram-plan.md` §1） |

**拆分手法**（顺序不可颠倒）：N6 把依赖显式化 → N5 把跨域同步调用换成 outbox → 同进程内按域建 handler → 流量证明需要时才把某个域换成同主机的独立进程 → 最后才是独立部署与独立库。任何一步都保持「对外 HTTP 契约不变」（三端前端因此完全不受影响，这也是决策 8 各端独立工程带来的好处）。

---

## 8. 需要用户拍板的点

1. **S1 是否插到 P2g（真实渠道切换）之前**：我的建议是硬前置 —— 真钱进来之前 F1/F4 必须闭环。
2. **幂等键放在 header 还是 body**：三端都要各改一次请求层（决策 8 的代价），所以定下来就别再改；建议 `Idempotency-Key` header，缺省由服务端从「用户 + 订单指纹」推导。
3. **`users`（MySQL）与 `members`（Mongo）合一**：F16。不合则会员域永远拆不干净。
4. **限流外置到 Redis 是否可接受多一跳**：换来多实例下真正生效的配额；Redis 已经是硬依赖（JWT 黑名单在用）。
5. **多实例部署是不是近期目标**：若否，N8/N11 可以完全等；若是，F15/F7 那两条就是阻塞项，得排进功能之前。
