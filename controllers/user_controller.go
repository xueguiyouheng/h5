// controllers 控制层
// UserController 负责处理用户相关的 HTTP 请求
// 包括分页查询用户列表、按 ID 查询单个用户
package controllers

import (
	"go-gin/middleware"
	"go-gin/models"
	"go-gin/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// UserController 用户控制器
// 处理用户模块的 HTTP 请求，通过 UserService 完成业务逻辑
type UserController struct {
	service *services.UserService // 用户业务服务
}

// NewUserController 创建用户控制器实例
func NewUserController() *UserController {
	return &UserController{
		service: services.NewUserService(),
	}
}

// GetUsers 处理分页查询用户列表请求
// 从 URL query 参数中解析 page 和 page_size，设置默认值和上限
// 返回统一格式的分页响应
// @Summary 后台用户列表（演示模块）
// @Tags admin-users
// @Produce json
// @Security CookieAuth
// @Param page query int false "页码，默认 1"
// @Param page_size query int false "每页条数，默认 10，上限 100"
// @Success 200 {object} models.ApiResponse{data=models.PageResult}
// @Router /api/users [get]
func (c *UserController) GetUsers(ctx *gin.Context) {
	// 解析分页参数，默认 page=1, page_size=10
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("page_size", "10"))

	// 参数校验：页码不能小于 1，每页条数限制在 1-100 之间
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	// 构建分页参数对象
	pagination := &models.Pagination{
		Page:     page,
		PageSize: pageSize,
	}

	// 调用 Service 层执行分页查询
	result, err := c.service.GetUsers(pagination)
	if err != nil {
		middleware.Error(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	middleware.Success(ctx, result)
}

// GetUserByID 处理按 ID 查询单个用户请求
// 从 URL 路径参数中解析用户 ID，校验后查询并返回用户信息
// @Summary 后台用户详情（演示模块）
// @Tags admin-users
// @Produce json
// @Security CookieAuth
// @Param id path int true "用户 ID"
// @Success 200 {object} models.ApiResponse{data=models.User}
// @Router /api/users/{id} [get]
func (c *UserController) GetUserByID(ctx *gin.Context) {
	// 解析路径参数中的用户 ID
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		middleware.Error(ctx, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	// 调用 Service 层根据 ID 查询用户
	user, err := c.service.GetUserByID(id)
	if err != nil {
		middleware.Error(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	// 用户不存在返回 404
	if user == nil {
		middleware.Error(ctx, http.StatusNotFound, "用户不存在")
		return
	}
	middleware.Success(ctx, user)
}
