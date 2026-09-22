// payment 支付模块
// http.go 模块自带的 HTTP 出口：路由注册、参数绑定与统一响应
// 路由前缀 /api/payment，会员身份由外层注入的 MemberFunc 解析，商城控制器不参与支付逻辑
package payment

import (
	"log"
	"net/http"

	"go-gin/middleware"

	"github.com/gin-gonic/gin"
)

// MemberFunc 从请求上下文解析出当前会员 ID
// 会员体系属于商城，本模块只要一个 ID，不 import 会员/鉴权代码
type MemberFunc func(ctx *gin.Context) (string, error)

// Payer 该会员在各渠道的付款人标识
// 渠道用它定位「钱从谁的账户扣」，因此只能由服务端按会员档案给出
type Payer struct {
	WxOpenID     string
	AlipayUserID string
}

// PayerFunc 按会员 ID 取付款人标识
// 没有这一层就等于让客户端自报付款人身份——传别人的 openid 是在替别人挑钱包
type PayerFunc func(memberID string) (Payer, error)

// Module 支付模块实例
type Module struct {
	svc      *Service
	memberID MemberFunc
	payer    PayerFunc
}

// NewModule 组装模块：订单适配器、会员解析与付款人解析都由外层注入，便于换端与换商城复用同一套支付
func NewModule(orders OrderGateway, memberID MemberFunc, payer PayerFunc) *Module {
	return &Module{svc: NewService(orders), memberID: memberID, payer: payer}
}

// RegisterMember 在需登录分组下注册支付接口
func (m *Module) RegisterMember(rg *gin.RouterGroup) {
	g := rg.Group("/payment")
	g.POST("/prepay", m.prepay)
	g.GET("/query/:id", m.query)
	g.POST("/launch/:id", m.launch)
	// 模拟渠道回调，由本站前端触发；渠道公网回调见 RegisterPublic
	g.POST("/mock-notify/:id", m.mockNotify)
}

// RegisterPublic 注册渠道公网回调
// 无 Cookie 无会话，来源合法性由渠道验签保证，因此既不能挂登录分组，也要在 CSRF 里豁免
func (m *Module) RegisterPublic(rg *gin.RouterGroup) {
	rg.POST("/payment/notify/:provider", m.notify)
	// 模拟渠道的唤起落点：浏览器整页跳进来，形态与真实渠道的同步跳转一致，
	// 因此只能是 GET 且不带 CSRF 头；真实渠道下该路由直接拒绝
	rg.GET("/payment/mock/launch", m.mockLaunch)
}

// prepay 建支付单
// @Summary 发起支付
// @Description 为待支付订单建支付单；同订单同渠道存在未过期的 pending 支付单时复用返回
// @Tags payment
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param body body payment.PrepayRequest true "订单 ID 与支付渠道 alipay / wechat"
// @Success 200 {object} models.ApiResponse{data=payment.Payment}
// @Failure 409 {object} models.ApiResponse "订单已支付"
// @Router /api/payment/prepay [post]
func (m *Module) prepay(ctx *gin.Context) {
	memberID, err := m.memberID(ctx)
	if err != nil {
		writeError(ctx, err)
		return
	}
	var req PrepayRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := m.svc.Prepay(memberID, req.OrderID, req.Provider)
	if err != nil {
		writeError(ctx, err)
		return
	}
	middleware.Success(ctx, data)
}

// query 支付单查询
// @Summary 支付单查询
// @Description 前端轮询用；超时的 pending 支付单会在读取时惰性置为 closed
// @Tags payment
// @Produce json
// @Security CookieAuth
// @Param id path string true "支付单 ID"
// @Success 200 {object} models.ApiResponse{data=payment.Payment}
// @Router /api/payment/query/{id} [get]
func (m *Module) query(ctx *gin.Context) {
	memberID, err := m.memberID(ctx)
	if err != nil {
		writeError(ctx, err)
		return
	}
	data, err := m.svc.Get(memberID, ctx.Param("id"))
	if err != nil {
		writeError(ctx, err)
		return
	}
	middleware.Success(ctx, data)
}

// launch 唤起支付
// @Summary 唤起支付
// @Description 按支付单渠道与发起端（X-Client，H5 再看 UA）返回唤起指令：form（支付宝 wap）/ redirect（微信 H5、模拟渠道）/ jsapi（微信小程序、微信内置浏览器）/ qrcode（桌面兜底）
// @Tags payment
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param X-Client header string false "发起端 h5 / mp_wechat / mp_alipay / app，缺省 h5；渠道据此选收款产品"
// @Param id path string true "支付单 ID"
// @Param body body payment.LaunchRequest true "模拟渠道可选的收款结果，真实渠道忽略"
// @Success 200 {object} models.ApiResponse{data=payment.Launch}
// @Failure 409 {object} models.ApiResponse "订单已支付"
// @Router /api/payment/launch/{id} [post]
func (m *Module) launch(ctx *gin.Context) {
	memberID, err := m.memberID(ctx)
	if err != nil {
		writeError(ctx, err)
		return
	}
	var req LaunchRequest
	if ctx.Request.ContentLength > 0 && !bindJSON(ctx, &req) {
		return
	}
	payer, err := m.payer(memberID)
	if err != nil {
		writeError(ctx, err)
		return
	}
	data, err := m.svc.Launch(memberID, ctx.Param("id"), LaunchEnv{
		Client:       clientOf(ctx),
		UserAgent:    ctx.Request.UserAgent(),
		OpenID:       payer.WxOpenID,
		AlipayUserID: payer.AlipayUserID,
		MockOutcome:  req.Outcome,
	})
	if err != nil {
		writeError(ctx, err)
		return
	}
	middleware.Success(ctx, data)
}

// mockLaunch 模拟渠道的唤起落点
// 真实流程里这一步发生在渠道收银台，本端点把它换成本地自托管：结算后 302 回前端结果页
// 只走 GET，与渠道同步跳转同形；PAY_PROVIDER 非 mock 时直接拒绝
// @Summary 模拟渠道唤起落点
// @Description 仅 PAY_PROVIDER=mock 可用；结算后 302 回前端支付结果页
// @Tags payment
// @Param payment_id query string true "支付单 ID"
// @Param outcome query string false "收款结果 success / failed"
// @Success 302 {string} string "重定向到支付结果页"
// @Router /api/payment/mock/launch [get]
func (m *Module) mockLaunch(ctx *gin.Context) {
	target, err := m.svc.MockReturn(ctx.Query("payment_id"), ctx.Query("outcome"))
	if err != nil {
		status, _ := StatusOf(err)
		ctx.AbortWithStatus(status)
		return
	}
	ctx.Redirect(http.StatusFound, target)
}

// mockNotify 模拟渠道回调
// @Summary 模拟支付回调
// @Description 仅 PAY_PROVIDER=mock 可用；真实渠道的回调走公网免登录路由并由渠道验签
// @Tags payment
// @Accept json
// @Produce json
// @Security CookieAuth
// @Param id path string true "支付单 ID"
// @Param body body payment.MockNotifyRequest true "回调结果 success / failed"
// @Success 200 {object} models.ApiResponse{data=payment.Payment}
// @Failure 422 {object} models.ApiResponse "支付单已关闭 / 金额不一致"
// @Router /api/payment/mock-notify/{id} [post]
func (m *Module) mockNotify(ctx *gin.Context) {
	memberID, err := m.memberID(ctx)
	if err != nil {
		writeError(ctx, err)
		return
	}
	var req MockNotifyRequest
	if !bindJSON(ctx, &req) {
		return
	}
	data, err := m.svc.MockNotify(memberID, ctx.Param("id"), req.Outcome)
	if err != nil {
		writeError(ctx, err)
		return
	}
	middleware.Success(ctx, data)
}

// notify 渠道公网异步回调
// 免登录、无 Cookie，身份由渠道验签/解密保证；应答格式由各渠道规定，不能套统一信封
// @Summary 支付渠道异步回调
// @Description 支付宝与微信服务器直接投递，验签不过一律失败应答，由渠道按策略重投
// @Tags payment
// @Produce plain
// @Param provider path string true "渠道 alipay / wechat"
// @Success 200 {string} string "success 或 {\"code\":\"SUCCESS\"}"
// @Router /api/payment/notify/{provider} [post]
func (m *Module) notify(ctx *gin.Context) {
	provider := ctx.Param("provider")
	err := m.svc.Notify(provider, ctx.Request)
	if err != nil {
		log.Printf("payment notify %s failed: %v", provider, err)
	}
	status, contentType, body := NotifyAck(provider, err)
	ctx.Data(status, contentType, []byte(body))
}

// clientOf 发起端标识，未知取值一律回落 H5
// 不能让一个拼错的头改变收款产品：产品选择是渠道侧硬约束，回落至少保住浏览器这条路
func clientOf(ctx *gin.Context) string {
	switch v := ctx.GetHeader("X-Client"); v {
	case ClientMPWechat, ClientMPAlipay, ClientApp:
		return v
	default:
		return ClientH5
	}
}

// bindJSON 统一处理请求体解析错误
func bindJSON(ctx *gin.Context, obj interface{}) bool {
	if err := ctx.ShouldBindJSON(obj); err != nil {
		middleware.Error(ctx, http.StatusBadRequest, "无效的请求参数")
		return false
	}
	return true
}

// writeError 把业务错误映射为统一响应信封
func writeError(ctx *gin.Context, err error) {
	status, message := StatusOf(err)
	middleware.Error(ctx, status, message)
}
