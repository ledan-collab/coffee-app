import { useEffect, useState } from 'react'
import AdminScreen from './AdminScreen.jsx'
import { createOrder, fetchAdminMenus, fetchMenus, fetchOrders, updateOrderStatus, updateStock } from './api.js'
import { formatPrice } from './format.js'
import './App.css'

const CART_KEY = 'cofeapp-cart'
const statusToUi = {
  '주문 접수': 'received',
  '제조 중': 'making',
  '완료': 'done',
}

function loadCart() {
  try {
    const data = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')
    if (!Array.isArray(data)) {
      return []
    }
    return data.filter(
      (item) =>
        Number.isInteger(item.menuId) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        Array.isArray(item.optionIds) &&
        item.optionIds.every((id) => Number.isInteger(id)),
    )
  } catch {
    return []
  }
}

function optionKey(menuId, optionIds) {
  return `${menuId}-${[...optionIds].sort((left, right) => left - right).join(',')}`
}

function optionText(menu, optionIds) {
  return menu.options
    .filter((option) => optionIds.includes(option.id))
    .map((option) => option.name.replaceAll(' ', '\u00A0'))
    .join(', ')
}

function menuLabel(menu, optionIds) {
  const extra = optionText(menu, optionIds)
  return extra ? `${menu.name} (${extra})` : menu.name
}

function orderItemLabel(item) {
  if (item.options.length === 0) {
    return item.menuName
  }
  const extra = item.options.map((option) => option.name.replaceAll(' ', '\u00A0')).join(', ')
  return `${item.menuName} (${extra})`
}

function linePrice(menu, item) {
  const extra = menu.options
    .filter((option) => item.optionIds.includes(option.id))
    .reduce((sum, option) => sum + option.price, 0)
  return (menu.price + extra) * item.quantity
}

function reservedQuantity(items, menuId) {
  return items.reduce((sum, item) => (item.menuId === menuId ? sum + item.quantity : sum), 0)
}

function toUiOrder(order) {
  return {
    id: order.id,
    orderedAt: new Date(order.orderedAt),
    totalPrice: order.totalPrice,
    status: statusToUi[order.status],
    items: order.items.map((item) => ({
      name: orderItemLabel(item),
      quantity: item.quantity,
    })),
  }
}

function knownCartItem(item, menus) {
  const menu = menus.find((entry) => entry.id === item.menuId)
  return Boolean(menu && item.optionIds.every((id) => menu.options.some((option) => option.id === id)))
}

function App() {
  const [screen, setScreen] = useState('order')
  const [menus, setMenus] = useState([])
  const [orders, setOrders] = useState([])
  const [cart, setCart] = useState(loadCart)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [orderNotice, setOrderNotice] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!ready) {
      return
    }
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart, ready])

  async function loadShop() {
    const [menuList, stockList, orderList] = await Promise.all([
      fetchMenus(),
      fetchAdminMenus(),
      fetchOrders(),
    ])
    const stockById = new Map(stockList.map((menu) => [menu.id, menu.stock]))
    const nextMenus = menuList.map((menu) => ({ ...menu, stock: stockById.get(menu.id) ?? 0 }))
    setMenus(nextMenus)
    setOrders(orderList.map(toUiOrder))
    setCart((current) => current.filter((item) => knownCartItem(item, nextMenus)))
    setLoadError('')
    setReady(true)
  }

  useEffect(() => {
    let active = true
    loadShop().catch((error) => {
      if (active) {
        setLoadError(error.message)
        setReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [])

  function toggleOption(menuId, optionId) {
    setSelectedOptions((current) => {
      const selected = current[menuId] ?? []
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      return { ...current, [menuId]: next }
    })
  }

  function addToCart(menu) {
    const selected = selectedOptions[menu.id] ?? []
    if (menu.stock - reservedQuantity(cart, menu.id) <= 0) {
      setOrderNotice({
        tone: 'warning',
        text: menu.stock === 0 ? '품절된 메뉴는 담을 수 없습니다.' : '재고가 없어 더 담을 수 없습니다.',
      })
      return
    }
    const key = optionKey(menu.id, selected)
    setCart((current) => {
      if (menu.stock - reservedQuantity(current, menu.id) <= 0) {
        return current
      }
      const existing = current.find((item) => item.key === key)
      if (!existing) {
        return [...current, { key, menuId: menu.id, optionIds: selected, quantity: 1 }]
      }
      return current.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item))
    })
    setSelectedOptions((current) => ({ ...current, [menu.id]: [] }))
    setOrderNotice(null)
  }

  function changeQuantity(key, delta) {
    const target = cart.find((item) => item.key === key)
    const menu = menus.find((entry) => entry.id === target?.menuId)
    if (delta > 0 && menu && menu.stock - reservedQuantity(cart, menu.id) <= 0) {
      setOrderNotice({
        tone: 'warning',
        text: menu.stock === 0 ? '품절된 메뉴는 수량을 늘릴 수 없습니다.' : '재고가 없어 수량을 늘릴 수 없습니다.',
      })
      return
    }
    setCart((current) =>
      current.flatMap((item) => {
        if (item.key !== key) {
          return [item]
        }
        const quantity = item.quantity + delta
        return quantity > 0 ? [{ ...item, quantity }] : []
      }),
    )
    setOrderNotice(null)
  }

  function removeFromCart(key) {
    setCart((current) => current.filter((item) => item.key !== key))
    setOrderNotice(null)
  }

  async function placeOrder() {
    if (cart.length === 0 || submitting) {
      return
    }
    if (menus.some((menu) => reservedQuantity(cart, menu.id) > menu.stock)) {
      setOrderNotice({ tone: 'warning', text: '재고보다 많이 담긴 메뉴가 있어 주문할 수 없습니다.' })
      return
    }

    setSubmitting(true)
    try {
      const order = await createOrder(
        cart.map((item) => ({
          menuId: item.menuId,
          quantity: item.quantity,
          optionIds: item.optionIds,
        })),
      )
      setCart([])
      setOrderNotice({
        tone: 'success',
        text: `주문이 완료되었습니다. 총 ${formatPrice(order.totalPrice)}`,
      })
      await loadShop()
    } catch (error) {
      setOrderNotice({ tone: 'warning', text: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStock(menuId, delta) {
    try {
      const updated = await updateStock(menuId, delta)
      setMenus((current) =>
        current.map((menu) => (menu.id === menuId ? { ...menu, stock: updated.stock } : menu)),
      )
      setLoadError('')
    } catch (error) {
      setLoadError(error.message)
    }
  }

  async function advanceOrder(orderId) {
    try {
      const updated = await updateOrderStatus(orderId)
      setOrders((current) => current.map((order) => (order.id === orderId ? toUiOrder(updated) : order)))
      setLoadError('')
    } catch (error) {
      setLoadError(error.message)
    }
  }

  if (!ready) {
    return (
      <div className="app">
        <header className="panel header">
          <h1 className="brand">COFEAPP</h1>
        </header>
        <section className="panel cart">
          <p className="order-empty" role="status">
            메뉴를 불러오는 중입니다.
          </p>
        </section>
      </div>
    )
  }

  if (screen === 'admin') {
    return (
      <AdminScreen
        menus={menus}
        orders={orders}
        loadError={loadError}
        onShowOrder={() => setScreen('order')}
        onChangeStock={changeStock}
        onAdvanceOrder={advanceOrder}
      />
    )
  }

  function outOfStock(menuId) {
    const menu = menus.find((entry) => entry.id === menuId)
    return !menu || menu.stock - reservedQuantity(cart, menuId) <= 0
  }

  const cartItems = cart.flatMap((item) => {
    const menu = menus.find((entry) => entry.id === item.menuId)
    if (!menu) {
      return []
    }
    return [
      {
        ...item,
        name: menuLabel(menu, item.optionIds),
        linePrice: linePrice(menu, item),
        soldOut: menu.stock === 0,
      },
    ]
  })
  const totalPrice = cartItems.reduce((sum, item) => sum + item.linePrice, 0)

  return (
    <div className="app">
      <header className="panel header">
        <h1 className="brand">COFEAPP</h1>
        <button type="button" className="nav-button" onClick={() => setScreen('admin')}>
          관리자
        </button>
      </header>

      {loadError ? (
        <p className="order-notice order-notice-warning" role="status">
          {loadError}
        </p>
      ) : null}

      <section className="menu-section" aria-label="메뉴">
        <ul className="menu-list">
          {menus.map((menu) => {
            const selected = selectedOptions[menu.id] ?? []
            return (
              <li key={menu.id} className="menu-item">
                <button
                  type="button"
                  className="menu-card"
                  onClick={() => addToCart(menu)}
                  disabled={menu.stock === 0}
                >
                  <span className="photo">{menu.stock === 0 ? '품절' : '사진'}</span>
                  <span className="menu-name">{menu.name}</span>
                  <span className="menu-price">{formatPrice(menu.price)}</span>
                  <span className="menu-description">{menu.description}</span>
                </button>
                <div className="menu-options">
                  {menu.options.map((option) => (
                    <label key={option.id} className="menu-option">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        aria-label={`${menu.name} ${option.name}`}
                        disabled={menu.stock === 0}
                        onChange={() => toggleOption(menu.id, option.id)}
                      />
                      {option.name}
                      <span className="option-price">+{formatPrice(option.price)}</span>
                    </label>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel cart" aria-label="장바구니">
        <div className="cart-layout">
          <div className="cart-orders">
            <h2>장바구니</h2>
            <ul className="cart-list">
              {cartItems.map((item) => (
                <li key={item.key} className="cart-item">
                  <span className="cart-item-name">
                    {item.name}
                    {item.soldOut ? <span className="cart-sold-out">품절</span> : null}
                  </span>
                  <span className="cart-item-qty">
                    <button
                      type="button"
                      className="cart-qty-button"
                      aria-label={`${item.name} 수량 줄이기`}
                      onClick={() => changeQuantity(item.key, -1)}
                    >
                      −
                    </button>
                    X {item.quantity}
                    <button
                      type="button"
                      className="cart-qty-button"
                      aria-label={`${item.name} 수량 늘리기`}
                      onClick={() => changeQuantity(item.key, 1)}
                      disabled={outOfStock(item.menuId)}
                    >
                      +
                    </button>
                  </span>
                  <span className="cart-item-price">{formatPrice(item.linePrice)}</span>
                  <button
                    type="button"
                    className="cart-remove"
                    aria-label={`${item.name} 빼기`}
                    onClick={() => removeFromCart(item.key)}
                  >
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="cart-summary">
            <div className="cart-summary-main">
              {orderNotice ? (
                <p className={`order-notice order-notice-${orderNotice.tone}`} role="status">
                  {orderNotice.text}
                </p>
              ) : null}
              <p className="cart-total">총 금액 {formatPrice(totalPrice)}</p>
            </div>
            <button
              type="button"
              className="order-button"
              onClick={placeOrder}
              disabled={cart.length === 0 || submitting}
            >
              주문하기
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
