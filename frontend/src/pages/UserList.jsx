import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '../stores/userStore'
import { useAuthStore } from '../stores/authStore'
import './UserList.css'

function parseSystems(raw) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function UserList() {
  const users = useUserStore((s) => s.users)
  const total = useUserStore((s) => s.total)
  const page = useUserStore((s) => s.page)
  const pageSize = useUserStore((s) => s.pageSize)
  const loading = useUserStore((s) => s.loading)
  const error = useUserStore((s) => s.error)
  const fetchUsers = useUserStore((s) => s.fetchUsers)
  const setPage = useUserStore((s) => s.setPage)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  useEffect(() => {
    fetchUsers(1)
  }, [fetchUsers])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="userlist-container">
      <header className="userlist-header">
        <div className="brand">
          <span className="logo">🔐</span>
          <h1>SSO 统一认证中心</h1>
        </div>
        <button className="logout-btn" onClick={handleLogout}>退出登录</button>
      </header>

      <main className="userlist-main">
        <div className="page-title">
          <h2>用户管理</h2>
          <span className="subtitle">共 {total} 个用户</span>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>邮箱</th>
                  <th>可访问系统</th>
                  <th>状态</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td className="username">{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <div className="tags">
                        {(() => {
                          const systems = parseSystems(u.systems_access)
                          if (systems.length === 0) {
                            return <span className="empty">-</span>
                          }
                          return systems.map((s) => (
                            <span key={s} className="tag">{s}</span>
                          ))
                        })()}
                      </div>
                    </td>
                    <td>
                      <span className={`status ${u.is_active ? 'active' : 'inactive'}`}>
                        {u.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="time">{new Date(u.created_at).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan="6" className="empty-row">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
            >上一页</button>
            <span className="page-info">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
            >下一页</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default UserList
