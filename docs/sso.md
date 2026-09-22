# SSO 统一认证中心 架构说明

## 什么是 SSO？

**SSO（Single Sign-On，单点登录）** 是一种身份认证机制，允许用户**只登录一次**就能访问多个关联的系统，无需为每个系统单独输入账号密码。

### SSO 的核心价值

| 方面 | 说明 |
|------|------|
| 用户体验 | 一次登录，多系统通行，减少重复认证 |
| 安全管控 | 统一入口，集中管控用户权限和会话 |
| 运维成本 | 账号体系统一，减少分散的密码管理 |

### SSO 的三种常见实现

```
┌─────────────────────────────────────────────────────────────┐
│                      SSO 实现方式                             │
├──────────────┬──────────────────┬────────────────────────────┤
│   方式       │    协议/技术      │          适用场景           │
├──────────────┼──────────────────┼────────────────────────────┤
│ 集中式 SSO   │  CAS / OAuth2    │ 企业内部多系统统一认证      │
│ 联邦式 SSO   │  SAML / OIDC     │ 跨组织信任，如企业对接      │
│ 无状态 SSO   │  JWT             │ 微服务架构，前后端分离      │
└──────────────┴──────────────────┴────────────────────────────┘
```

本项目采用 **JWT 无状态 SSO** 方案。

---

## 本项目角色

```
                    ┌──────────────────┐
                    │   SSO 统一认证    │
                    │   中心 (本项目)   │
                    │  ┌────────────┐  │
                    │  │  React 前端│  │
                    │  │ + Go API   │  │
                    │  └────────────┘  │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │  系统 A     │  │  系统 B     │  │  系统 C     │
    │  (如 OA)    │  │  (如 CRM)   │  │  (如 HR)    │
    └─────────────┘  └─────────────┘  └─────────────┘
      用户需有 A 权限  用户需有 B 权限  用户需有 C 权限
```

- **认证中心**：本项目负责用户登录、JWT 令牌签发、令牌校验
- **业务系统**：各业务系统集成 JWT 校验逻辑，从令牌中读取用户身份和权限

---

## 认证流程详解

### 1. 登录流程（前端 → 后端）

```
浏览器                     Go 后端                    MySQL
  │                          │                         │
  │  POST /api/login         │                         │
  │  {username, password}   │                         │
  │ ───────────────────────►│                         │
  │                          │  SELECT * FROM users    │
  │                          │  WHERE username = ?     │
  │                          │ ───────────────────────►│
  │                          │  ◄──────────────────────│
  │                          │                         │
  │                          │  bcrypt 校验密码         │
  │                          │  检查 is_active        │
  │                          │  签发 JWT 令牌          │
  │                          │                         │
  │  Set-Cookie: sso_token   │                         │
  │  =<jwt>; HttpOnly;       │                         │
  │  SameSite=Lax            │                         │
  │  Set-Cookie: sso_csrf    │                         │
  │  =<csrf>; SameSite=Lax   │                         │
  │ ◄───────────────────────│                         │
  │                          │                         │
  │  浏览器自动保存 Cookie    │                         │
  │  HttpOnly → JS 无法读取   │                         │
  │  后续请求自动携带 Cookie  │                         │
```

### 2. 访问受保护资源

```
浏览器                     Go 后端                    MySQL
  │                          │                         │
  │  GET /api/users          │                         │
  │  Cookie: sso_token=<jwt> │  浏览器自动携带          │
  │  Cookie: sso_csrf=<csrf> │  (POST 还带 CSRF 头)    │
  │ ───────────────────────►│                         │
  │                          │  JWT 中间件校验         │
  │                          │  - 从 Cookie 读取令牌    │
  │                          │  - 签名是否有效         │
  │                          │  - 是否过期             │
  │                          │                         │
  │                          │  校验通过，继续执行       │
  │                          │  查询用户列表            │
  │                          │ ───────────────────────►│
  │                          │  ◄──────────────────────│
  │  {code:200, data:...}    │                         │
  │ ◄───────────────────────│                         │
```

**令牌读取优先级**（`middleware/jwt.go` extractToken）：

1. **HttpOnly Cookie** `sso_token`（首选，防 XSS）
2. **Authorization: Bearer `<token>`**（兼容 API 调试 / 第三方客户端）

### 3. JWT 令牌结构

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "user_id": 1,
    "username": "admin",
    "iss": "go-gin",
    "iat": 1787971354,
    "exp": 1788057754
  },
  "signature": "Dslbcx8OIpxk6wo2Rf_QR02uMvdIlxORRn4V3PyfW6g"
}
```

| 字段 | 说明 |
|------|------|
| user_id | 用户 ID，对应 users 表主键 |
| username | 用户名 |
| iss | 签发者（固定为 go-gin） |
| iat | 签发时间 |
| exp | 过期时间（默认 24 小时） |

### 4. 认证流程图（Mermaid）

```mermaid
sequenceDiagram
    participant Browser as 前端 React
    participant Server as Go 后端
    participant DB as MySQL

    Browser->>Server: POST /api/login {username, password}
    Server->>DB: SELECT * FROM users WHERE username = ?
    DB-->>Server: 返回用户记录（含 password_hash）
    Server->>Server: bcrypt.CompareHashAndPassword
    Server->>Server: 检查 is_active
    Server->>Server: GenerateToken(userID, username, secret, 24h)
    Server-->>Browser: Set-Cookie: sso_token=<jwt><br/>HttpOnly; SameSite=Lax<br/>Set-Cookie: sso_csrf=<csrf>
    Browser->>Browser: 浏览器自动保存 Cookie（JS 无法读 sso_token）

    Note over Browser,Server: 后续请求浏览器自动携带 Cookie

    Browser->>Server: GET /api/users<br/>Cookie: sso_token=<jwt>
    Server->>Server: JWTAuthMiddleware 校验
    Server->>Server: 从 Cookie 提取令牌 → ParseToken
    Server->>Server: 验证签名、有效期
    Server->>Server: 提取 userID, username 到 Context
    Server->>DB: SELECT ... LIMIT ? OFFSET ?
    DB-->>Server: 用户列表
    Server-->>Browser: {code:200, data:{list, total, ...}}
```

---

## 多系统访问控制

### systems_access 字段设计

数据库 `users` 表中的 `systems_access` 字段存储用户可访问的系统列表：

```json
["A", "B", "C"]
```

### 权限校验思路

```
┌───────────────────────────────────────────────────────┐
│                    业务系统接入流程                      │
├───────────────────────────────────────────────────────┤
│  1. 用户先到认证中心完成登录，获得 JWT 令牌             │
│  2. JWT 中可包含（或通过 /api/users/:id 获取）          │
│     systems_access 权限信息                            │
│  3. 业务系统根据 systems_access 判断用户是否有权访问     │
│  4. 无权限返回 403 Forbidden                           │
└───────────────────────────────────────────────────────┘
```

### 示例权限数据

| 用户 | systems_access | 可访问系统 |
|------|---------------|-----------|
| admin | ["A","B","C"] | 全部系统 |
| user_a | ["A"] | 仅系统 A |
| user_b | ["B"] | 仅系统 B |

---

## 接口清单

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 用户登录，Set-Cookie 写入 JWT |

### 需鉴权接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/logout` | 用户登出，清除 Cookie（需带 CSRF Token） |
| GET | `/api/users` | 分页查询用户列表 |
| GET | `/api/users/:id` | 查询单个用户详情 |

### 认证方式（双轨并行）

**方式一：HttpOnly Cookie（前端推荐）**

登录成功后，后端自动通过 Set-Cookie 写入 JWT：

```
Set-Cookie: sso_token=<jwt>; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax
Set-Cookie: sso_csrf=<csrf>; Path=/; SameSite=Lax
```

浏览器后续请求自动携带，前端无需手动处理令牌。

**方式二：Authorization 头（第三方客户端）**

```http
GET /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

> 后端中间件优先从 Cookie 读取，Cookie 不存在时才回退到 Authorization 头。

### CSRF 防护

写操作（POST/PUT/DELETE/PATCH）需要在请求头携带 `X-CSRF-Token`：

```http
POST /api/logout
X-CSRF-Token: <value-of-sso_csrf-cookie>
Cookie: sso_token=<jwt>
```

`SameSite=Lax` 已阻止大部分跨站 CSRF，Double Submit Cookie 作为纵深防御。

### 登出接口详解

**请求**

```http
POST /api/logout
Cookie: sso_token=<jwt>
X-CSRF-Token: <csrf-token>
```

**成功响应（200）**

```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

响应同时清除服务端 Cookie：
```
Set-Cookie: sso_token=; Path=/; Max-Age=-1; HttpOnly; SameSite=Lax
Set-Cookie: sso_csrf=; Path=/; Max-Age=-1; SameSite=Lax
```

### 登录接口详解

**请求**

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应（200）**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer"
  }
}
```

**失败响应（401）**

```json
{
  "code": 401,
  "message": "用户名或密码错误",
  "data": null
}
```

### 使用令牌

**前端无需手动处理！** 浏览器自动携带 Cookie：

```http
GET /api/users
# 浏览器自动附带: Cookie: sso_token=<jwt>
```

**第三方客户端使用 Authorization 头：**

```http
GET /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 前端集成指南

### 开发模式

```bash
# 终端 1：启动 Go 后端（端口 8080）
cd go-gin && go run main.go

# 终端 2：启动 Vite 前端（端口 5173）
cd go-gin/frontend && npm run dev
```

Vite 已配置 proxy，`/api` 请求自动转发到 `localhost:8080`，**开发模式无跨域问题**。

### 生产构建

```bash
# 构建前端
cd go-gin/frontend && npm run build
# 产物输出到 go-gin/frontend/dist/

# 启动 Go 后端
cd go-gin && GIN_MODE=release go run main.go
# 当 frontend/dist 存在时，Go 自动托管静态文件
# Cookie Secure 自动启用，仅 HTTPS 传输
# 前端路由刷新也能正确返回 index.html
```

### axios 自动 Cookie 凭证 + CSRF

前端已封装 `src/utils/request.js`，关键配置：

```js
const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,   // 自动携带 Cookie
})

// 请求拦截器 - 写操作自动附带 CSRF Token
request.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'delete', 'patch'].includes(method)) {
    const csrf = getCookie('sso_csrf')  // 从可读 Cookie 中读取
    if (csrf) {
      config.headers['X-CSRF-Token'] = csrf
    }
  }
  return config
})

// 响应拦截器 - 401 自动跳登录页
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

**前端鉴权状态检测**（`App.jsx` PrivateRoute）：

HttpOnly Cookie 无法被 JS 读取，所以不再检查 localStorage。改为：首次访问受保护路由时，先发一个 `/api/users?page=1&page_size=1` 请求探测登录状态。成功 → 渲染页面；401 → 跳转登录页。

### HttpOnly Cookie vs localStorage 对比

| 特性 | localStorage | HttpOnly Cookie (本项目) |
|------|-------------|------------------------|
| XSS 窃取 | ❌ 高危，任何 JS 可读 | ✅ 彻底隔离，JS 无法访问 |
| 自动携带 | ❌ 需手动注入 Authorization | ✅ 浏览器自动附带 |
| 过期控制 | ❌ 前端手动删除 | ✅ Set-Cookie Max-Age 精确控制 |
| CSRF | ✅ 天然免疫 | ⚠️ 需 SameSite + Double Submit |
| 多标签页 | ✅ 自动同步 | ✅ 自动同步 |
| 登出 | 前端删本地即可 | 服务端 Set-Cookie 失效 |

---

## 安全机制

### 已实现（纵深防御）

| 层级 | 机制 | 说明 |
|------|------|------|
| **传输层** | HTTPS（生产） | `GIN_MODE=release` 自动 `CookieSecure=true` |
| **存储层** | HttpOnly Cookie | JS 无法读取，杜绝 XSS 窃取令牌 |
| **存储层** | SameSite=Lax | 阻止跨站 POST 携带 Cookie，防 CSRF |
| **令牌层** | HS256 签名 | HMAC-SHA256，密钥 256 位随机 |
| **令牌层** | 过期时间 | 默认 24 小时 |
| **令牌层** | 算法校验 | 防止算法混淆攻击 |
| **密码层** | bcrypt | 成本 10，加盐哈希 |
| **防护层** | Double Submit Cookie | CSRF Token Cookie + Header 双校验 |
| **防护层** | 接口限流 | 每 IP 每分钟 60 次 |
| **防护层** | 账号枚举防护 | 登录失败统一返回"用户名或密码错误" |
| **防护层** | 响应隐藏 | password_hash 不在 JSON 中暴露 |
| **配置层** | 环境变量 | JWT 密钥通过 `JWT_SECRET` 注入 |
| **CORS** | 动态回显 Origin | 允许凭证模式，替代 `*` |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JWT_SECRET` | `go-gin-default-secret-change-me` | JWT 签名密钥，**生产必须替换** |
| `GIN_MODE` | `debug` | 设为 `release` 自动启用 `CookieSecure=true` |
| `COOKIE_SECURE` | `false` | 强制开启 Cookie Secure（即使 debug 模式） |
| `DB_MAX_OPEN_CONNS` | 100 | 数据库最大连接数 |
| `DB_MAX_IDLE_CONNS` | 20 | 数据库最大空闲连接数 |

### 生产环境额外建议

| 建议 | 说明 |
|------|------|
| 强制 HTTPS | 使用 Nginx/Caddy 做 TLS 终结 |
| CORS 白名单 | 将动态回显改为具体域名白名单 |
| 令牌刷新 | 实现 Refresh Token 机制，Access Token 2h 过期 |
| 主动登出 | sessions 表 + 令牌黑名单，支持踢人 |
| 登录失败锁定 | 连续 5 次失败锁定账号 15 分钟 |
| 审计日志 | 记录登录/登出/权限变更等关键操作 |
| 设备绑定 | 令牌绑定设备指纹，防止被盗用 |

---

## 后续扩展方向

### 完整 SSO 能力

当前项目实现了"认证中心"的核心功能，要支持**真正的跨系统单点登录/登出**，建议扩展：

```
┌──────────────────────────────────────────────────────────────┐
│                    SSO 能力演进路线                           │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ 当前阶段      │ 阶段 1       │ 阶段 2       │ 阶段 3          │
├──────────────┼──────────────┼──────────────┼─────────────────┤
│ JWT 签发     │ 令牌刷新     │ 单点登出     │ OIDC 协议支持   │
│ 基础校验      │ Refresh Token│ Session 表  │ 标准化对接     │
│ 限流保护      │ 双令牌机制   │ 主动失效     │ 第三方应用注册  │
└──────────────┴──────────────┴──────────────┴─────────────────┘
```

### 数据库 sessions 表的作用

当前 `sessions` 表已创建，可用于实现：

- **主动登出**：用户点击"退出登录"时，在 sessions 表记录会话状态为已失效，中间件校验时先查 sessions 表
- **多端管理**：用户可以查看和管理已登录的设备/会话
- **单点登出**：一处登出，所有关联系统自动失效

### 令牌刷新机制

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Access Token │     │ Refresh Token │     │   数据库     │
├─────────────┤     ├──────────────┤     ├──────────────┤
│ 短过期(2h)  │     │ 长过期(7天)   │     │ 存储 RT      │
│ 每次请求携带 │     │ 仅用于换发    │     │ 校验 RT 有效 │
└─────────────┘     └──────────────┘     └──────────────┘

流程：
1. 登录成功 → 返回 Access Token + Refresh Token
2. 日常请求 → 携带 Access Token
3. Access Token 过期 → 用 Refresh Token 换发新的 Access Token
4. Refresh Token 过期 → 强制重新登录
```

---

## 快速测试

```bash
# === Cookie 鉴权模式（前端）===

# 1. 登录并保存 Cookie
curl -v -c cookie.txt -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 响应中可看到 Set-Cookie: sso_token=<jwt>; HttpOnly; SameSite=Lax

# 2. 用 Cookie 访问受保护接口
curl -s -b cookie.txt http://localhost:8080/api/users?page=1\&page_size=1 | jq .

# 3. 登出（需带 CSRF Token，cookie.txt 中已包含 sso_csrf）
curl -s -b cookie.txt -X POST http://localhost:8080/api/logout \
  -H "X-CSRF-Token: $(grep sso_csrf cookie.txt | awk '{print $NF}')" | jq .


# === Authorization 头模式（第三方客户端）===

# 1. 登录获取令牌
TOKEN=$(curl -s -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .data.token)

# 2. 访问用户列表
curl -s http://localhost:8080/api/users \
  -H "Authorization: Bearer $TOKEN" | jq .


# === 前端页面 ===
# 开发模式: http://localhost:5173/login
# 生产部署: http://localhost:8080/login
```

测试账号：`admin` / `admin123`
