# 数据库表结构说明

## 数据库信息

- **数据库名**: `sso_system`
- **字符集**: `utf8mb4`
- **排序规则**: `utf8mb4_general_ci`
- **存储引擎**: InnoDB

---

## 表清单

| 表名 | 说明 |
|------|------|
| users | 用户表，存储系统用户信息 |
| sessions | 会话表，存储用户登录会话数据 |

---

## users - 用户表

存储系统用户的账号信息，支持多系统访问控制。

### 表结构

| 字段 | 类型 | 可空 | 键 | 默认值 | 说明 |
|------|------|------|-----|--------|------|
| id | INT | NO | PRI (auto_increment) | - | 用户 ID，主键自增 |
| username | VARCHAR(50) | NO | UNI | - | 用户名，唯一 |
| email | VARCHAR(100) | NO | UNI | - | 邮箱，唯一 |
| password_hash | VARCHAR(255) | NO | - | - | 密码哈希值（bcrypt 加密） |
| systems_access | TEXT | YES | - | NULL | 可访问的系统列表，JSON 数组格式 |
| is_active | TINYINT(1) | YES | - | 1 | 账号是否启用 (1=启用, 0=禁用) |
| created_at | TIMESTAMP | YES | - | CURRENT_TIMESTAMP | 创建时间，自动生成 |
| updated_at | TIMESTAMP | YES | - | CURRENT_TIMESTAMP ON UPDATE | 更新时间，自动更新 |

### 字段详情

#### password_hash

使用 bcrypt 算法加密存储，格式为 `$2b$10$...`。

- **加密成本**: 10 轮
- **存储长度**: 固定 60 字符（当前为 255 以兼容未来升级）
- **注意**: 永远不要在 JSON 响应中暴露此字段（Go 模型中使用 `json:"-"` 标签隐藏）

#### systems_access

存储用户可访问的系统列表，采用 JSON 数组格式：

```json
["A", "B", "C"]
```

- **存储格式**: TEXT 类型存储 JSON 字符串
- **解析方式**: 业务层解析为 `[]string` 使用
- **示例值**: `["A","B","C"]` 表示用户可访问 A、B、C 三个系统

### 索引

| 索引名 | 字段 | 类型 |
|--------|------|------|
| PRIMARY | id | 主键 |
| uk_username | username | 唯一索引 |
| uk_email | email | 唯一索引 |

### 示例数据

| id | username | email | is_active | systems_access |
|----|----------|-------|-----------|----------------|
| 1 | admin | admin@example.com | 1 | ["A","B","C"] |
| 2 | user_a | user_a@example.com | 1 | ["A"] |
| 3 | user_b | user_b@example.com | 1 | ["B"] |

### 建表 DDL

```sql
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `email` varchar(100) NOT NULL COMMENT '邮箱',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希(bcrypt)',
  `systems_access` text COMMENT '可访问系统列表(JSON数组)',
  `is_active` tinyint(1) DEFAULT 1 COMMENT '是否启用',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

---

## sessions - 会话表

存储用户登录后的会话信息，用于 SSO 单点登录会话管理。

### 表结构

| 字段 | 类型 | 可空 | 键 | 默认值 | 说明 |
|------|------|------|-----|--------|------|
| session_id | VARCHAR(128) | NO | PRI | - | 会话 ID，主键，UUID 格式 |
| expires | INT UNSIGNED | NO | - | - | 会话过期时间戳 (Unix 秒) |
| data | TEXT | YES | - | NULL | 会话数据，JSON 格式存储 |

### 字段详情

#### session_id

会话唯一标识符，通常使用 UUID v4 生成。

- **长度**: 128 字符（预留扩展空间）
- **生成方式**: `uuid.New()` (Go) 或 `gen_random_uuid()` (PostgreSQL)

#### expires

会话过期时间，存储 Unix 时间戳（秒）。

- **类型**: INT UNSIGNED
- **示例**: `1735689600` (对应 2025-01-01)
- **校验逻辑**: 服务端校验 `expires > 当前时间` 判定会话是否有效

#### data

会话附加数据，JSON 格式存储，可包含用户信息、权限等。

```json
{
  "user_id": 1,
  "username": "admin",
  "roles": ["admin"]
}
```

### 索引

| 索引名 | 字段 | 类型 |
|--------|------|------|
| PRIMARY | session_id | 主键 |

### 建表 DDL

```sql
CREATE TABLE `sessions` (
  `session_id` varchar(128) NOT NULL COMMENT '会话ID(UUID)',
  `expires` int unsigned NOT NULL COMMENT '过期时间戳(Unix秒)',
  `data` text COMMENT '会话数据(JSON)',
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话表';
```

---

## ER 关系图

```
┌─────────────────────┐          ┌─────────────────────┐
│        users        │          │      sessions       │
├─────────────────────┤          ├─────────────────────┤
│ id            (PK)  │          │ session_id    (PK)  │
│ username      (UK)  │          │ expires             │
│ email         (UK)  │          │ data                │
│ password_hash       │          └─────────────────────┘
│ systems_access      │
│ is_active           │
│ created_at          │
│ updated_at          │
└─────────────────────┘

说明: users 与 sessions 为独立表，通过业务逻辑关联
      (sessions.data 中存储 user_id 引用 users.id)
```

---

## 设计说明

### 密码安全

- 使用 **bcrypt** 加密，成本因子 10
- 存储哈希值而非明文
- Go 模型中通过 `json:"-"` 标签在序列化时隐藏

### 会话管理

- 会话 ID 使用 UUID，防止遍历攻击
- 过期时间使用服务端时间校验，防止客户端篡改
- 会话数据采用 JSON 格式，灵活扩展

### JSON 字段

`systems_access` 和 `sessions.data` 使用 JSON 格式存储在 TEXT 字段中，原因：
- 避免频繁变更表结构
- 支持灵活的数据结构
- 注意：MySQL 5.7+ 也支持 JSON 类型，可根据需要升级

### 连接池配置

在 `config/config.go` 中配置数据库连接池：

```go
DB.SetMaxOpenConns(100)           // 最大连接数
DB.SetMaxIdleConns(20)            // 最大空闲连接数
DB.SetConnMaxLifetime(time.Hour)  // 连接最大存活时间
```