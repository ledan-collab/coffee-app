import { useState } from 'react'
import { menus } from './menus.js'
import './App.css'

function formatPrice(amount) {
  return `${amount.toLocaleString('ko-KR')}원`
}

function App() {
  const [cart, setCart] = useState([])

  function addToCart(menuId) {
    setCart((current) => {
      const existing = current.find((item) => item.menuId === menuId)
      if (!existing) {
        return [...current, { menuId, quantity: 1 }]
      }
      return current.map((item) =>
        item.menuId === menuId ? { ...item, quantity: item.quantity + 1 } : item,
      )
    })
  }

  function placeOrder() {
    if (cart.length === 0) {
      return
    }
    setCart([])
  }

  const cartItems = cart.map((item) => {
    const menu = menus.find((entry) => entry.id === item.menuId)
    return {
      ...item,
      name: menu.name,
      linePrice: menu.price * item.quantity,
    }
  })
  const totalPrice = cartItems.reduce((sum, item) => sum + item.linePrice, 0)

  return (
    <div className="app">
      <header className="panel header">
        <h1 className="brand">COFEAPP</h1>
        <button type="button" className="nav-button">
          관리자
        </button>
      </header>

      <section className="menu-section" aria-label="메뉴">
        <ul className="menu-list">
          {menus.map((menu) => (
            <li key={menu.id}>
              <button
                type="button"
                className="menu-card"
                onClick={() => addToCart(menu.id)}
              >
                <span className="photo">사진</span>
                <span className="menu-name">{menu.name}</span>
                <span className="menu-price">{formatPrice(menu.price)}</span>
                <span className="menu-description">{menu.description}</span>
              </button>
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
                <li key={item.menuId} className="cart-item">
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
