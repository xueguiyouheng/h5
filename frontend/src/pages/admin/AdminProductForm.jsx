import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProduct,
  fetchCategories,
  fetchProduct,
  formatMoney,
  parseMoney,
  updateProduct,
} from '../../api/admin'
import ImagePicker from './ImagePicker'
import { useGoBack } from '../../hooks/useGoBack'
import { Button, ErrorText, Field, Panel, Select, Spinner, TextArea, TextInput } from './adminUi'

const CATEGORY_PAGE_SIZE = 100
const DEFAULT_CURRENCY = 'USD'
const CURRENCIES = [
  { code: 'USD', label: 'USD（$）' },
  { code: 'MYR', label: 'MYR（RM）' },
]
const SECTIONS = [
  { key: 'exclusive_offer', label: '专属优惠 Exclusive Offer' },
  { key: 'best_selling', label: '热销 Best Selling' },
  { key: 'recommend', label: '为你推荐 Recommend' },
]

const EMPTY_FORM = {
  name: '',
  category_id: '',
  subcategory_id: '',
  price_text: '',
  old_price_text: '',
  badge: '',
  currency: DEFAULT_CURRENCY,
  unit: 'per kg',
  stock: '0',
  sort: '',
  sections: [],
  status: 'on',
  description: '',
  image_url: '',
  images: [],
}

function fromProduct(product) {
  return {
    ...EMPTY_FORM,
    name: product.name ?? '',
    category_id: product.category_id ? String(product.category_id) : '',
    subcategory_id: product.subcategory_id ? String(product.subcategory_id) : '',
    price_text: product.price ?? '',
    old_price_text: product.old_price ?? '',
    badge: product.badge ?? '',
    currency: product.currency || DEFAULT_CURRENCY,
    unit: product.unit ?? '',
    stock: String(product.stock ?? 0),
    sort: product.sort === undefined || product.sort === null ? '' : String(product.sort),
    sections: Array.isArray(product.sections) ? [...product.sections] : [],
    status: product.status === 'off' ? 'off' : 'on',
    description: product.description ?? '',
    image_url: product.image_url ?? '',
    images: Array.isArray(product.images) ? [...product.images] : [],
  }
}

function validateForm(form, parsedPrice) {
  const errors = {}
  const name = form.name.trim()
  if (!name) errors.name = '请输入商品名称'
  else if (name.length < 2 || name.length > 40) errors.name = '名称长度需在 2-40 个字符之间'

  if (!form.price_text.trim()) errors.price = '请输入价格'
  else if (!parsedPrice.price) errors.price = '价格需包含数字，例如 4.99 或 $4.99 / kg'
  else if (!(Number(parsedPrice.price) > 0)) errors.price = '价格必须大于 0'

  if (form.old_price_text.trim() && !parseMoney(form.old_price_text).price) errors.old_price = '原价需包含数字，或留空'
  if (!form.category_id) errors.category_id = '请选择类目'
  if (!form.image_url) errors.image_url = '请上传或选择主图'
  if (form.stock === '' || !/^\d+$/.test(String(form.stock))) errors.stock = '库存需为不小于 0 的整数'
  if (form.sort !== '' && !/^-?\d+$/.test(String(form.sort))) errors.sort = '排序权重需为整数'
  if (form.badge.trim().length > 12) errors.badge = '角标不超过 12 个字符'
  return errors
}

function ProductForm({ productId, product, categories }) {
  const isEdit = Boolean(productId)
  const navigate = useNavigate()
  const goBack = useGoBack()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => (product ? fromProduct(product) : EMPTY_FORM))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')

  const selectedCategory = categories.find((category) => String(category.id) === form.category_id)
  const subcategories = selectedCategory?.subcategories ?? []
  const parsedPrice = parseMoney(form.price_text)
  const previewPrice = formatMoney(parsedPrice.price, form.currency, form.unit || parsedPrice.unit)

  const save = useMutation({
    mutationFn: ({ targetId, payload }) => (targetId ? updateProduct(targetId, payload) : createProduct(payload)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'product'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
      if (!isEdit && saved?.id) queryClient.setQueryData(['admin', 'product', String(saved.id)], saved)
      navigate('/admin/products')
    },
  })

  const patch = (key) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const patchCategory = (event) => {
    setForm((prev) => ({ ...prev, category_id: event.target.value, subcategory_id: '' }))
  }

  const toggleSection = (key) => () => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.includes(key) ? prev.sections.filter((item) => item !== key) : [...prev.sections, key],
    }))
  }

  const setImageAt = (index) => (url) => {
    setForm((prev) => {
      const images = [...prev.images]
      if (url) images[index] = url
      else images.splice(index, 1)
      return { ...prev, images }
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateForm(form, parsedPrice)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setFormError('请先修正表单中标红的问题')
      return
    }
    setFormError('')
    const payload = {
      name: form.name.trim(),
      price: parsedPrice.price,
      currency: form.currency,
      unit: form.unit.trim() || parsedPrice.unit,
      old_price: form.old_price_text.trim() ? parseMoney(form.old_price_text).price : '',
      badge: form.badge.trim(),
      image_url: form.image_url,
      images: form.images.filter(Boolean),
      category_id: form.category_id,
      subcategory_id: form.subcategory_id,
      sections: form.sections,
      stock: Number(form.stock),
      status: form.status,
      description: form.description.trim(),
    }
    if (form.sort !== '') payload.sort = Number(form.sort)
    save.mutate({ targetId: isEdit ? productId : null, payload })
  }

  return (
    <Panel
      title={isEdit ? `编辑商品 #${productId}` : '新建商品'}
      description="图片仅保存上传接口返回的 URL，主图为必填"
      actions={
        <Button variant="ghost" size="sm" onClick={goBack} disabled={save.isPending}>
          返回列表
        </Button>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="max-w-[880px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="商品名称" htmlFor="product-name" required error={errors.name}>
            <TextInput id="product-name" value={form.name} onChange={patch('name')} invalid={Boolean(errors.name)} placeholder="有机西兰花" />
          </Field>
          <Field label="角标" htmlFor="product-badge" hint="例如 有机 / 热卖，最多 12 字" error={errors.badge}>
            <TextInput id="product-badge" value={form.badge} onChange={patch('badge')} invalid={Boolean(errors.badge)} />
          </Field>
          <Field label="类目" htmlFor="product-category" required error={errors.category_id}>
            <Select id="product-category" value={form.category_id} onChange={patchCategory} invalid={Boolean(errors.category_id)}>
              <option value="">请选择类目</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="子分类"
            htmlFor="product-subcategory"
            hint={!form.category_id ? '请先选择类目' : subcategories.length === 0 ? '该类目暂无子分类' : ''}
          >
            <Select
              id="product-subcategory"
              value={form.subcategory_id}
              onChange={patch('subcategory_id')}
              disabled={!form.category_id || subcategories.length === 0}
            >
              <option value="">未分配</option>
              {subcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="价格" htmlFor="product-price" required hint="可直接输入 $4.99 / kg" error={errors.price}>
            <TextInput
              id="product-price"
              value={form.price_text}
              onChange={patch('price_text')}
              invalid={Boolean(errors.price)}
              placeholder="4.99"
            />
          </Field>
          <Field label="原价" htmlFor="product-old-price" hint="留空表示无划线价" error={errors.old_price}>
            <TextInput
              id="product-old-price"
              value={form.old_price_text}
              onChange={patch('old_price_text')}
              invalid={Boolean(errors.old_price)}
              placeholder="6.99"
            />
          </Field>
          <Field label="币种" htmlFor="product-currency">
            <Select id="product-currency" value={form.currency} onChange={patch('currency')}>
              {CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="单位" htmlFor="product-unit">
            <TextInput id="product-unit" value={form.unit} onChange={patch('unit')} placeholder="per kg" />
          </Field>
          <Field label="库存" htmlFor="product-stock" required error={errors.stock}>
            <TextInput
              id="product-stock"
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={patch('stock')}
              invalid={Boolean(errors.stock)}
            />
          </Field>
          <Field label="排序权重" htmlFor="product-sort" hint="可选，数值越大越靠前" error={errors.sort}>
            <TextInput
              id="product-sort"
              type="number"
              step="1"
              value={form.sort}
              onChange={patch('sort')}
              invalid={Boolean(errors.sort)}
              placeholder="留空使用默认"
            />
          </Field>
          <Field label="状态" htmlFor="product-status">
            <Select id="product-status" value={form.status} onChange={patch('status')}>
              <option value="on">上架</option>
              <option value="off">下架</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-md bg-[#f7f8fa] px-3 py-2">
              <div className="text-[11px] text-[#8b93a1]">价格预览</div>
              <div className="mt-0.5 text-sm font-medium text-[#111827]">{previewPrice || '-'}</div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <span className="block mb-2 text-[13px] font-medium text-[#374151]">首页版块</span>
          <div className="flex flex-wrap gap-4">
            {SECTIONS.map((section) => (
              <label
                key={section.key}
                htmlFor={`section-${section.key}`}
                className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer"
              >
                <input
                  id={`section-${section.key}`}
                  type="checkbox"
                  className="w-4 h-4 accent-[#00b861]"
                  checked={form.sections.includes(section.key)}
                  onChange={toggleSection(section.key)}
                />
                {section.label}
              </label>
            ))}
          </div>
        </div>

        <Field label="商品描述" htmlFor="product-description">
          <TextArea
            id="product-description"
            rows={4}
            value={form.description}
            onChange={patch('description')}
            placeholder="产地、规格、保鲜建议等"
          />
        </Field>

        <Field label="主图" htmlFor="product-image" required error={errors.image_url}>
          <ImagePicker
            value={form.image_url}
            alt={form.name || '商品主图'}
            onChange={(url) => setForm((prev) => ({ ...prev, image_url: url }))}
          />
        </Field>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-[#374151]">图集（{form.images.length}）</span>
            <Button size="sm" variant="ghost" onClick={() => setForm((prev) => ({ ...prev, images: [...prev.images, ''] }))}>
              添加一张
            </Button>
          </div>
          {form.images.length === 0 && <p className="m-0 text-xs text-[#9aa3af]">可选：补充细节图，顺序即前台展示顺序。</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.images.map((url, index) => (
              <ImagePicker
                key={`gallery-${index}`}
                value={url}
                alt={`${form.name || '商品'} 细节图 ${index + 1}`}
                onChange={setImageAt(index)}
              />
            ))}
          </div>
        </div>

        {formError && <ErrorText message={formError} />}
        {save.isError && (
          <ErrorText message={save.error instanceof Error ? save.error.message : '保存失败，请检查后端返回'} />
        )}

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[#eef0f3]">
          <Button variant="ghost" onClick={() => navigate('/admin/products')} disabled={save.isPending}>
            取消
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? '提交中…' : isEdit ? '保存修改' : '发布商品'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function AdminProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const productQuery = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => fetchProduct(id),
    enabled: isEdit,
  })
  const categoryQuery = useQuery({
    queryKey: ['admin', 'categories', 1, CATEGORY_PAGE_SIZE],
    queryFn: () => fetchCategories({ page: 1, pageSize: CATEGORY_PAGE_SIZE }),
  })

  if (isEdit && productQuery.isPending) return <Spinner label="商品资料加载中..." />
  if (isEdit && productQuery.isError) {
    return (
      <ErrorText
        message={productQuery.error instanceof Error ? productQuery.error.message : '商品资料加载失败'}
        onRetry={() => productQuery.refetch()}
      />
    )
  }

  return (
    <ProductForm
      key={isEdit ? `edit-${id}` : 'create'}
      productId={isEdit ? id : null}
      product={isEdit ? productQuery.data : null}
      categories={categoryQuery.data?.list ?? []}
    />
  )
}

export default AdminProductForm
