// payment 支付模块：可独立复用的支付域，H5 / 小程序 / App 共用同一套状态机与渠道适配
//
// 模块边界：
//   - 不 import services：需要订单信息时只认本包的 OrderGateway，由外层接线注入
//   - 渠道差异全部收在 provider.go / alipay.go / wechat.go，service.go 只处理支付单状态机
//   - HTTP 出口在本包 http.go，路由前缀 /api/payment，换端不改控制器
//   - mock 的边界只有一处：渠道「回来的那份响应体」换成同结构假报文，
//     拼请求、签名、解析、金额复核、结算全部与真实渠道走同一段代码
//
// 本包自带金额与 mongo 底座，不复用 services 的私有 helper：
// 商城业务和支付业务各自演进，共用一份内部函数会让两者互相牵制。
// 契约与接入步骤见 docs/payment-integration.md
package payment
