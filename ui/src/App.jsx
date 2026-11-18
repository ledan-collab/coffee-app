import { useEffect, useState } from 'react'
import AdminScreen from './AdminScreen.jsx'
import { formatPrice } from './format.js'
import { menus } from './menus.js'
import './App.css'

const OPTION_PRICE = 500
const STORAGE_KEY = 'cofeapp-state'
const initialStocks = Object.fromEntries(menus.map((menu) => [menu.id, 10]))
const initialOptions = Object.fromEntries(
  menus.map((menu) => [menu.id, { shot: false, syrup: false }]),
)

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const data = JSON.parse(raw)
    const stocks = Object.fromEntries(
      menus.map((menu) => {
        const value = Number(data.stocks?.[menu.id])
        return [menu.id, Number.isFinite(value) ? Math.max(0, value) : initialStocks[menu.id]]
      }),
    )
    const options = Object.fromEntries(
      menus.map((menu) => [
        menu.id,
        {
          shot: Boolean(data.options?.[menu.id]?.shot),
          syrup: Boolean(data.options?.[menu.id]?.syrup),
        },
      ]),
    )
    const cart = Array.isArray(data.cart)
      ? data.cart.filter((item) => menus.some((menu) => menu.id === item.menuId))
      : []
    const orders = Array.isArray(data.orders)
      ? data.orders.map((order) => ({ ...order, orderedAt: new Date(order.orderedAt) }))
      : []
    return { cart, orders, stocks, options }
  } catch {
    return null
  }
}

const savedState = loadSavedState()

function optionKey(menuId, shot, syrup) {
  return `${menuId}-${shot ? 'shot' : 'plain'}-${syrup ? 'syrup' : 'plain'}`
}

function optionText(shot, syrup) {
  const labels = []
  if (shot) {
    labels.push('샷\u00A0추가')
  }
  if (syrup) {
    labels.push('시럽\u00A0추가')
  }
  return labels.join(', ')
}

function menuLabel(name, shot, syrup) {
  const extra = optionText(shot, syrup)
  return extra ? `${name} (${extra})` : name
}

function linePrice(menu, item) {
  const extras = (item.shot ? OPTION_PRICE : 0) + (item.syrup ? OPTION_PRICE : 0)
  return (menu.price + extras) * item.quantity
}

function reservedQuantity(items, menuId) {
  return items.reduce((sum, item) => (item.menuId === menuId ? sum + item.quantity : sum), 0)
}

function App() {
  const [screen, setScreen] = useState('order')
  const [cart, setCart] = useState(savedState?.cart ?? [])
  const [orders, setOrders] = useState(savedState?.orders ?? [])
  const [stocks, setStocks] = useState(savedState?.stocks ?? initialStocks)
  const [options, setOptions] = useState(savedState?.options ?? initialOptions)
  const [orderNotice, setOrderNotice] = useState(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, orders, stocks, options }))
  }, [cart, orders, stocks, options])

  function toggleOption(menuId, optionName) {
    setOptions((current) => ({
      ...current,
      [menuId]: { ...current[menuId], [optionName]: !current[menuId][optionName] },
    }))
  }

  function addToCart(menuId) {
    if (stocks[menuId] - reservedQuantity(cart, menuId) <= 0) {
      setOrderNotice({
        tone: 'warning',
        text: stocks[menuId] === 0 ? '품절된 메뉴는 담을 수 없습니다.' : '재고가 없어 더 담을 수 없습니다.',
      })
      return
    }
    const selected = options[menuId]
    const key = optionKey(menuId, selected.shot, selected.syrup)
    setCart((current) => {
      if (stocks[menuId] - reservedQuantity(current, menuId) <= 0) {
        return current
      }
      const existing = current.find((item) => item.key === key)
      if (!existing) {
        return [...current, { key, menuId, shot: selected.shot, syrup: selected.syrup, quantity: 1 }]
      }
      return current.map((item) =>
        item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
      )
    })
    setOptions((current) => ({
      ...current,
      [menuId]: { shot: false, syrup: false },
    }))
    setOrderNotice(null)
  }

  function changeQuantity(key, delta) {
    const target = cart.find((item) => item.key === key)
    if (delta > 0 && target && stocks[target.menuId] - reservedQuantity(cart, target.menuId) <= 0) {
      setOrderNotice({
        tone: 'warning',
        text: stocks[target.menuId] === 0 ? '품절된 메뉴는 수량을 늘릴 수 없습니다.' : '재고가 없어 수량을 늘릴 수 없습니다.',
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

  function placeOrder() {
    if (cart.length === 0) {
      return
    }
    if (menus.some((menu) => reservedQuantity(cart, menu.id) > stocks[menu.id])) {
      setOrderNotice({ tone: 'warning', text: '재고보다 많이 담긴 메뉴가 있어 주문할 수 없습니다.' })
      return
    }

    const items = cart.map((item) => {
      const menu = menus.find((entry) => entry.id === item.menuId)
      return {
        menuId: item.menuId,
        name: menuLabel(menu.name, item.shot, item.syrup),
        quantity: item.quantity,
        linePrice: linePrice(menu, item),
      }
    })
    const totalPrice = items.reduce((sum, item) => sum + item.linePrice, 0)

    setOrders((current) => [
      {
        id: crypto.randomUUID(),
        orderedAt: new Date(),
        items,
        totalPrice,
        status: 'received',
      },
      ...current,
    ])
    setCart([])
    setOrderNotice({
      tone: 'success',
      text: `주문이 완료되었습니다. 총 ${formatPrice(totalPrice)}`,
    })
  }

  function changeStock(menuId, delta) {
    setStocks((current) => ({
      ...current,
      [menuId]: Math.max(0, current[menuId] + delta),
    }))
  }

  function advanceOrder(orderId) {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) {
          return order
        }
        if (order.status === 'received') {
          return { ...order, status: 'making' }
        }
        if (order.status === 'making') {
          return { ...order, status: 'done' }
        }
        return order
      }),
    )
  }

  if (screen === 'admin') {
    return (
      <AdminScreen
        orders={orders}
        stocks={stocks}
        onShowOrder={() => setScreen('order')}
        onChangeStock={changeStock}
        onAdvanceOrder={advanceOrder}
      />
    )
  }

  function outOfStock(menuId) {
    return stocks[menuId] - reservedQuantity(cart, menuId) <= 0
  }

  const cartItems = cart.map((item) => {
    const menu = menus.find((entry) => entry.id === item.menuId)
    return {
      ...item,
      name: menuLabel(menu.name, item.shot, item.syrup),
      linePrice: linePrice(menu, item),
    }
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

      <section className="menu-section" aria-label="메뉴">
        <ul className="menu-list">
          {menus.map((menu) => (
            <li key={menu.id} className="menu-item">
              <button
                type="button"
                className="menu-card"
                onClick={() => addToCart(menu.id)}
                disabled={stocks[menu.id] === 0}
              >
                <span className="photo">{stocks[menu.id] === 0 ? '품절' : '사진'}</span>
                <span className="menu-name">{menu.name}</span>
                <span className="menu-price">{formatPrice(menu.price)}</span>
                <span className="menu-description">{menu.description}</span>
              </button>
              <div className="menu-options">
                <label className="menu-option">
                  <input
                    type="checkbox"
                    checked={options[menu.id].shot}
                    aria-label={`${menu.name} 샷 추가`}
                    disabled={stocks[menu.id] === 0}
                    onChange={() => toggleOption(menu.id, 'shot')}
                  />
                  샷 추가
                  <span className="option-price">+500원</span>
                </label>
                <label className="menu-option">
                  <input
                    type="checkbox"
                    checked={options[menu.id].syrup}
                    aria-label={`${menu.name} 시럽 추가`}
                    disabled={stocks[menu.id] === 0}
                    onChange={() => toggleOption(menu.id, 'syrup')}
                  />
                  시럽 추가
                  <span className="option-price">+500원</span>
                </label>
              </div>
            </li>
          ))}
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
                    {stocks[item.menuId] === 0 ? <span className="cart-sold-out">품절</span> : null}
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
              disabled={cart.length === 0}
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
