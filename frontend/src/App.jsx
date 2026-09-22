import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './pages/Login'
import UserList from './pages/UserList'
import Search from './pages/Search'
import Category from './pages/Category'
import Detail from './pages/Detail'
import Checkout from './pages/Checkout'
import PaymentResult from './pages/PaymentResult'
import MyOrder from './pages/MyOrder'
import MyProfile from './pages/MyProfile'
import Favorites from './pages/Favorites'
import MyVoucher from './pages/MyVoucher'
import MyAddress from './pages/MyAddress'
import Settings from './pages/Settings'
import HelpCenter from './pages/HelpCenter'
import LiveChat from './pages/LiveChat'
import OnBoarding from './pages/OnBoarding'
import Register from './pages/Register'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCarousel from './pages/admin/AdminCarousel'
import AdminCategories from './pages/admin/AdminCategories'
import AdminProducts from './pages/admin/AdminProducts'
import AdminProductForm from './pages/admin/AdminProductForm'
import AdminOrders from './pages/admin/AdminOrders'
import AdminOrderDetail from './pages/admin/AdminOrderDetail'
import AdminStore from './pages/admin/AdminStore'
import AdminMedia from './pages/admin/AdminMedia'
import TabBar from './components/TabBar'
import TabStack from './components/TabStack'
import ScrollMemory from './components/ScrollMemory'
import { useAuthStore } from './stores/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
})

function PrivateRoute({ children }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const checking = useAuthStore((s) => s.checking)
  const checkAuth = useAuthStore((s) => s.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#999' }}>
        正在验证登录状态...
      </div>
    )
  }

  return isAuthed ? children : <Navigate to="/login" replace />
}

// 四个根 tab 的内容由常驻 TabStack 渲染，这里只占住路由做鉴权
function TabHolder() {
  return null
}

function App() {
  useEffect(() => {
    document.title = 'SSO 统一认证中心'
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TabStack />
        <ScrollMemory />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<OnBoarding />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/users"
            element={
              <PrivateRoute>
                <UserList />
              </PrivateRoute>
            }
          />
          <Route
            path="/shop"
            element={
              <PrivateRoute>
                <TabHolder />
              </PrivateRoute>
            }
          />
          <Route
            path="/search"
            element={
              <PrivateRoute>
                <Search />
              </PrivateRoute>
            }
          />
          <Route
            path="/category/:id"
            element={
              <PrivateRoute>
                <Category />
              </PrivateRoute>
            }
          />
          <Route
            path="/product/:id"
            element={
              <PrivateRoute>
                <Detail />
              </PrivateRoute>
            }
          />
          <Route
            path="/cart"
            element={
              <PrivateRoute>
                <TabHolder />
              </PrivateRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <PrivateRoute>
                <Checkout />
              </PrivateRoute>
            }
          />
          <Route
            path="/payment/result"
            element={
              <PrivateRoute>
                <PaymentResult />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <TabHolder />
              </PrivateRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <PrivateRoute>
                <MyOrder />
              </PrivateRoute>
            }
          />
          <Route
            path="/my-profile"
            element={
              <PrivateRoute>
                <MyProfile />
              </PrivateRoute>
            }
          />
          <Route
            path="/favorites"
            element={
              <PrivateRoute>
                <Favorites />
              </PrivateRoute>
            }
          />
          <Route
            path="/vouchers"
            element={
              <PrivateRoute>
                <MyVoucher />
              </PrivateRoute>
            }
          />
          <Route
            path="/addresses"
            element={
              <PrivateRoute>
                <MyAddress />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Settings />
              </PrivateRoute>
            }
          />
          <Route
            path="/help"
            element={
              <PrivateRoute>
                <HelpCenter />
              </PrivateRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <PrivateRoute>
                <LiveChat />
              </PrivateRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <PrivateRoute>
                <TabHolder />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="carousel" element={<AdminCarousel />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="products/new" element={<AdminProductForm />} />
            <Route path="products/:id/edit" element={<AdminProductForm />} />
            <Route path="media" element={<AdminMedia />} />
            <Route path="store" element={<AdminStore />} />
          </Route>
          <Route path="*" element={<Navigate to="/users" replace />} />
        </Routes>
        <TabBar />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
