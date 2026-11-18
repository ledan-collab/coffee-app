import { useState } from 'react'
import AdminScreen from './AdminScreen.jsx'
import { formatPrice } from './format.js'
import { menus } from './menus.js'
import './App.css'

const initialStocks = Object.fromEntries(menus.map((menu) => [menu.id, 10]))
const initialOptions = Object.fromEntries(
  menus.map((menu) => [menu.id, { shot: false, syrup: false }]),
)

function optionKey(menuId, shot, syrup) {
  return `${menuId}-${shot ? 'shot' : 'plain'}-${syrup ? 'syrup' : 'plain'}`
}

function optionText(shot, syrup) {
  const labels = []
  if (shot) {
    labels.push('샷 추가')
  }
  if (syrup) {
    labels.push('시럽 추가')
  }
  return labels.join(', ')
}

function menuLabel(name, shot, syrup) {
  const extra = optionText(shot, syrup)
  return extra ? `${name} (${extra})` : name
}

function App() {
  const [screen, setScreen] = useState('order')
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
  const [stocks, setStocks] = useState(initialStocks)
  const [options, setOptions] = useState(initialOptions)

  function toggleOption(menuId, optionName) {
    setOptions((current) => ({
      ...current,
      [menuId]: { ...current[menuId], [optionName]: !current[menuId][optionName] },
    }))
  }

  function addToCart(menuId) {
    const selected = options[menuId]
    const key = optionKey(menuId, selected.shot, selected.syrup)
    setCart((current) => {
      const existing = current.find((item) => item.key === key)
      if (!existing) {
        return [...current, { key, menuId, shot: selected.shot, syrup: selected.syrup, quantity: 1 }]
      }
      return current.map((item) =>
        item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
      )
    })
  }

  function placeOrder() {
    if (cart.length === 0) {
      return
    }

    const items = cart.map((item) => {
      const menu = menus.find((entry) => entry.id === item.menuId)
      return {
        menuId: item.menuId,
        name: menuLabel(menu.name, item.shot, item.syrup),
        quantity: item.quantity,
        linePrice: menu.price * item.quantity,
      }
    })

    setOrders((current) => [
      {
        id: crypto.randomUUID(),
        orderedAt: new Date(),
        items,
        totalPrice: items.reduce((sum, item) => sum + item.linePrice, 0),
        status: 'received',
      },
      ...current,
    ])
    setCart([])
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

  const cartItems = cart.map((item) => {
    const menu = menus.find((entry) => entry.id === item.menuId)
    return {
      ...item,
      name: menuLabel(menu.name, item.shot, item.syrup),
      linePrice: menu.price * item.quantity,
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
              <button type="button" className="menu-card" onClick={() => addToCart(menu.id)}>
                <span className="photo">사진</span>
                <span className="menu-name">{menu.name}</span>
                <span className="menu-price">{formatPrice(menu.price)}</span>
                <span className="menu-description">{menu.description}</span>
              </button>
              <div className="menu-options">
                <label className="menu-option">
                  <input
                    type="checkbox"
                    checked={options[menu.id].shot}
                    onChange={() => toggleOption(menu.id, 'shot')}
                  />
                  샷 추가
                </label>
                <label className="menu-option">
                  <input
                    type="checkbox"
                    checked={options[menu.id].syrup}
                    onChange={() => toggleOption(menu.id, 'syrup')}
                  />
                  시럽 추가
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
                  <span className="cart-item-name">{item.name}</span>
                  <span className="cart-item-qty">X {item.quantity}</span>
                  <span className="cart-item-price">{formatPrice(item.linePrice)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cart-summary">
            <p className="cart-total">총 금액 {formatPrice(totalPrice)}</p>
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
