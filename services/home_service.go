// services 业务逻辑层
// 封装业务逻辑，被 controllers 层调用，不直接处理 HTTP 请求/响应
package services

// HomeService 首页业务服务
// 处理首页相关的业务逻辑，目前仅返回简单的问候信息
type HomeService struct{}

// NewHomeService 创建首页服务实例
func NewHomeService() *HomeService {
	return &HomeService{}
}

// GetHello 获取首页问候信息
// 返回一个简单的问候消息，后续可扩展为从配置或数据库读取
func (s *HomeService) GetHello() map[string]string {
	return map[string]string{
		"message": "hello world",
	}
}
