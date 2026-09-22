// models 数据模型模块
// 定义分页请求参数和分页响应结构
package models

// Pagination 分页请求参数
// Page: 当前页码（从 1 开始），PageSize: 每页条数
type Pagination struct {
	Page     int `json:"page"`      // 当前页码，从 1 开始
	PageSize int `json:"page_size"` // 每页条数
}

// Offset 计算 SQL LIMIT 子句的偏移量
// 偏移量 = (页码 - 1) * 每页条数
func (p *Pagination) Offset() int {
	return (p.Page - 1) * p.PageSize
}

// PageResult 分页响应结构
// 封装分页查询的结果数据，包含列表、总数和分页信息
type PageResult struct {
	List     interface{} `json:"list"`      // 当前页的数据列表
	Total    int64       `json:"total"`     // 符合条件的总记录数
	Page     int         `json:"page"`      // 当前页码
	PageSize int         `json:"page_size"` // 每页条数
}
