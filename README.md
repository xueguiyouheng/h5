# Go Gin SSO 系统

基于 Go 语言 + Gin 框架构建的单点登录（SSO）系统后端服务，提供用户管理、统一认证等功能。

## 技术栈

### 后端

| 类别 | 技术 | 版本 |
|------|------|------|
| 语言 | Go | 1.14 |
| 框架 | Gin | v1.7.7 |
| 数据库 | MySQL | 5.7+ |
| 数据库驱动 | go-sql-driver/mysql | v1.6.0 |
| JWT 鉴权 | dgrijalva/jwt-go | v3.2.0 |
| 密码加密 | golang.org/x/crypto/bcrypt | - |

### 前端

| 类别 | 技术 | 版本 |
|------|------|------|
| 构建工具 | Vite | v8+ |
| 框架 | React | v19 |
| 路由 | React Router | v7 |
| HTTP 客户端 | Axios | v1+ |

## 项目结构

```
go-gin/
├── main.go                     # 程序入口，初始化 DB + 启动服务
├── go.mod / go.sum             # Go 模块依赖
├── frontend/                   # 前端工程 (Vite + React)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx       # 登录页面
│   │   │   └── UserList.jsx    # 用户列表页面
│   │   ├── utils/
│   │   │   └── request.js      # Axios 封装 (自动带 JWT)
│   │   ├── App.jsx             # 路由配置
│   │   └── main.jsx            # 入口
│   ├── vite.config.js          # Vite 配置 (含 /api proxy)
│   └── package.json
├── config/
│   └── config.go               # 数据库连接池 + JWT 密钥配置
├── models/                     # 数据模型层
│   ├── user.go                 # 用户模型 (对应 users 表)
│   ├── auth.go                 # 登录请求/响应结构
│   ├── response.go             # 统一响应结构
│   └── pagination.go           # 分页请求/响应结构
├── services/                   # 业务逻辑层
│   ├── home_service.go         # 首页业务逻辑
│   ├── user_service.go         # 用户 CRUD 业务逻辑
│   └── auth_service.go         # 登录认证 + 密码校验 + JWT 签发
├── controllers/                # 控制层 (HTTP 请求处理)
│   ├── home_controller.go      # 首页控制器
│   ├── user_controller.go      # 用户控制器
│   └── auth_controller.go      # 登录控制器
├── middleware/                  # 中间件层
│   ├── cors.go                 # CORS 跨域中间件
│   ├── response.go             # 统一响应格式封装
│   ├── ratelimit.go            # IP 限流中间件
│   └── jwt.go                  # JWT 鉴权中间件
├── utils/
│   └── jwt.go                  # JWT 签发与解析工具
├── cmd/                        # 开发辅助工具
│   ├── reset_password/         # 重置账号密码工具
│   └── checkpass/              # bcrypt 哈希校验工具
├── routers/
│   └── router.go               # 路由注册
└── docs/
    ├── product-prototype.md    # 产品原型与功能文档（H5 闭环范围 / 优缺点 / 小程序与 App 准备）
    ├── miniprogram-plan.md     # 微信 / 支付宝小程序落地方案（复用清单 / 后端改造 / 分期，未开工）
    ├── api.md                  # 数据接口文档
    ├── payment-integration.md  # 支付接入与切换真实渠道的契约
    ├── database.md             # 数据库表结构说明
    └── sso.md                  # SSO 架构说明
```

## 架构分层

```
HTTP 请求流程:

Client  →  Routers  →  Middleware  →  Controllers  →  Services  →  MySQL
                                                              ↑
                                                         Models (数据模型)
```

| 层级 | 目录 | 职责 |
|------|------|------|
| **路由层** | `routers/` | 注册 URL 与 Controller 的映射，挂载中间件 |
| **中间件** | `middleware/` | 统一响应格式、接口限流、JWT 鉴权等通用逻辑 |
| **控制层** | `controllers/` | 解析 HTTP 请求参数，调用 Service，返回响应 |
| **业务层** | `services/` | 封装业务逻辑，执行数据库操作 |
| **模型层** | `models/` | 定义数据结构 (DTO/Entity) |
| **工具层** | `utils/` | JWT 签发/解析等通用工具函数 |
| **配置层** | `config/` | 数据库连接池、JWT 密钥初始化 |

## 快速开始

### 1. 前置条件

- Go 1.14+
- Node.js 20+
- MySQL 5.7+ (或通过 Docker 运行)

### 2. 启动 MySQL (Docker)

```bash
docker run -d --name sso-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=sso_system \
  -p 3306:3306 \
  mysql:5.7
```

### 3. 修改数据库配置

编辑 `config/config.go` 中的 DSN：

```go
dsn := "root:rootpassword@tcp(127.0.0.1:3306)/sso_system?charset=utf8mb4&parseTime=True&loc=Local"
```

### 4. 配置 JWT 密钥

JWT 签名密钥通过环境变量 `JWT_SECRET` 注入：

```bash
export JWT_SECRET="your-strong-secret-key"
```

未设置时使用 `config/config.go` 中的默认值（仅用于开发，生产环境务必注入强随机密钥）。

### 5. 启动后端

```bash
cd go-gin
go run main.go
```

后端服务默认运行在 `http://localhost:8080`

### 6. 启动前端（开发模式）

```bash
cd go-gin/frontend
npm install
npm run dev
```

前端开发服务器运行在 `http://localhost:5173`，Vite 已配置 proxy 将 `/api` 请求转发到后端 `localhost:8080`，**开发模式无跨域问题**。

### 7. 生产构建与部署

```bash
# 构建前端
cd go-gin/frontend
npm run build
# 产物输出到 go-gin/frontend/dist/

# 启动后端（自动托管前端静态文件）
cd go-gin
GIN_MODE=release go run main.go
# 当 frontend/dist 存在时，Go 自动托管前端构建产物
# 访问 http://localhost:8080 即可使用完整应用
```

### 6. API 测试

```bash
# === 方式一：HttpOnly Cookie 鉴权 (前端/浏览器推荐) ===

# 登录并保存 Cookie
curl -c cookie.txt -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 用 Cookie 访问受保护接口
curl -b cookie.txt "http://localhost:8080/api/users?page=1&page_size=5"

# 登出 (需带 CSRF Token)
CSRF=$(awk '/sso_csrf/ {print $NF}' cookie.txt)
curl -b cookie.txt -X POST http://localhost:8080/api/logout \
  -H "X-CSRF-Token: $CSRF"


# === 方式二：Authorization 头 (第三方 API 调用) ===

TOKEN=$(curl -s -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .data.token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/users/1
```

## API 接口

### 统一响应格式

所有接口均返回以下 JSON 结构：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | HTTP 状态码 |
| message | string | 提示信息 |
| data | any | 业务数据 |

### 接口列表

| Method | URL | 鉴权 | CSRF | 说明 |
|--------|-----|------|------|------|
| GET | `/` | 无需 | - | 首页问候 |
| POST | `/api/login` | 无需 | 豁免 | 用户登录，签发 HttpOnly Cookie |
| POST | `/api/logout` | 需 JWT | 需 | 用户登出，清除 Cookie |
| GET | `/api/users` | 需 JWT | - | 查询用户列表（分页） |
| GET | `/api/users/:id` | 需 JWT | - | 根据 ID 查询用户 |

> **鉴权方式**：前端通过 HttpOnly Cookie 自动携带 JWT；第三方客户端也可通过 `Authorization: Bearer <token>` 头认证。

### POST /api/login - 用户登录

**请求体:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应示例 (成功):**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer"
  }
}
```

**响应示例 (失败):**

```json
{
  "code": 401,
  "message": "用户名或密码错误",
  "data": null
}
```

获取令牌后，在访问受保护接口时通过 `Authorization` 请求头携带：

```
Authorization: Bearer <token>
```

### GET /api/users - 查询用户列表

**Query 参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | int | 1 | 当前页码 |
| page_size | int | 10 | 每页条数 (上限 100) |

**响应示例:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com",
        "systems_access": "[\"A\",\"B\",\"C\"]",
        "is_active": true,
        "created_at": "2025-12-13T04:10:59Z",
        "updated_at": "2025-12-13T04:10:59Z"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 10
  }
}
```

### GET /api/users/:id - 查询单个用户

**响应示例 (用户存在):**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "systems_access": "[\"A\",\"B\",\"C\"]",
    "is_active": true,
    "created_at": "2025-12-13T04:10:59Z",
    "updated_at": "2025-12-13T04:10:59Z"
  }
}
```

**响应示例 (用户不存在):**

```json
{
  "code": 404,
  "message": "用户不存在",
  "data": null
}
```

## 中间件

| 中间件 | 文件 | 说明 |
|--------|------|------|
| CORS 跨域 | `middleware/cors.go` | 允许跨域请求，开发模式方便调试 |
| 响应中间件 | `middleware/response.go` | 统一封装成功/错误响应 |
| 限流中间件 | `middleware/ratelimit.go` | 基于 IP 的滑动窗口限流（每分钟 60 次） |
| JWT 鉴权中间件 | `middleware/jwt.go` | 校验 Bearer 令牌，保护受控接口 |

## 登录页面

- 开发模式：访问 `http://localhost:5173/login`
- 生产部署：访问 `http://localhost:8080/login`（Go 托管前端静态文件）

测试账号：`admin` / `admin123`

## SSO 架构说明

详细 SSO 架构、认证流程、对接指南请参见 [docs/sso.md](docs/sso.md)。

## JWT 鉴权

项目使用 JWT（HS256 算法）实现无状态鉴权：

1. **登录**：`POST /api/login` 校验用户名密码，签发 24 小时有效期的 JWT 令牌
2. **携带**：客户端在 `Authorization: Bearer <token>` 请求头中携带令牌
3. **校验**：JWT 鉴权中间件校验签名与有效期，通过后将用户信息写入上下文

### 密钥配置

- 签名密钥通过环境变量 `JWT_SECRET` 注入
- 密码使用 bcrypt 算法加密存储，登录时通过 `bcrypt.CompareHashAndPassword` 校验

### 相关文件

| 文件 | 职责 |
|------|------|
| `utils/jwt.go` | JWT 签发与解析 |
| `middleware/jwt.go` | 鉴权中间件 |
| `services/auth_service.go` | 登录业务逻辑 + 密码校验 |
| `controllers/auth_controller.go` | 登录接口 |

## 数据库连接池

在 `config/config.go` 中配置：

| 参数 | 值 | 说明 |
|------|----|------|
| SetMaxOpenConns | 100 | 最大同时打开的连接数 |
| SetMaxIdleConns | 20 | 最大空闲连接数 |
| SetConnMaxLifetime | 1h | 连接最大存活时间 |

## 数据库表结构

详细表结构说明请参见 [docs/database.md](docs/database.md)。