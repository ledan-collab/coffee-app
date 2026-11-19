import { formatOrderTime, formatPrice, stockStatus } from './format.js'

const dashboardItems = [
  { status: 'all', label: '총 주문' },
  { status: 'received', label: '주문 접수' },
  { status: 'making', label: '제조 중' },
  { status: 'done', label: '제조 완료' },
]

const orderStatusLabel = {
  received: '주문 접수',
  making: '제조 중',
  done: '제조 완료',
}

const orderActionLabel = {
  received: '제조 시작',
  making: '제조 완료',
}

function AdminScreen({ menus, orders, loadError, onShowOrder, onChangeStock, onAdvanceOrder }) {
  return (
    <div className="app">
      <header className="panel header">
        <h1 className="brand">COFEAPP</h1>
        <button type="button" className="nav-button" onClick={onShowOrder}>
          주문하기
        </button>
      </header>

      {loadError ? (
        <p className="order-notice order-notice-warning" role="status">
          {loadError}
        </p>
      ) : null}

      <section className="panel admin-section" aria-label="대시보드">
        <h2>대시보드</h2>
        <ul className="dashboard-list">
          {dashboardItems.map((item) => {
            const count =
              item.status === 'all'
                ? orders.length
                : orders.filter((order) => order.status === item.status).length
            return (
              <li key={item.status} className="stat-card">
                <span className="stat-label">{item.label}</span>
                <strong className="stat-count">{count}</strong>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel admin-section stock-section" aria-label="재고">
        <h2>재고</h2>
        <ul className="stock-list">
          {menus.map((menu) => {
            const count = menu.stock
            const status = stockStatus(count)
            return (
              <li key={menu.id} className="stock-card">
                <span className="stock-name">{menu.name}</span>
                <span className="stock-meta">
                  <strong className="stock-count">{count}</strong>
                  <span className={`stock-status stock-status-${status.tone}`}>{status.label}</span>
                </span>
                <div className="stock-actions">
                  <button type="button" aria-label={`${menu.name} 재고 늘리기`} onClick={() => onChangeStock(menu.id, 1)}>
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`${menu.name} 재고 줄이기`}
                    onClick={() => onChangeStock(menu.id, -1)}
                    disabled={count === 0}
                  >
                    -
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section
        className={`panel admin-section order-section${orders.length === 0 ? ' is-empty' : ''}`}
        aria-label="주문현황"
      >
        <h2>주문현황</h2>
        {orders.length === 0 ? (
          <p className="order-empty">접수된 주문이 없습니다.</p>
        ) : (
        <ul className="order-list">
          {orders.map((order) => (
            <li key={order.id} className="order-row">
              <span className="order-time">{formatOrderTime(order.orderedAt)}</span>
              <span className="order-menus">
                {order.items.map((item) => `${item.name} X ${item.quantity}`).join(', ')}
              </span>
              <span className="order-price">{formatPrice(order.totalPrice)}</span>
              <span className="order-state">{orderStatusLabel[order.status]}</span>
              {order.status === 'done' ? null : (
                <button
                  type="button"
                  className="order-button"
                  onClick={() => onAdvanceOrder(order.id)}
                >
                  {orderActionLabel[order.status]}
                </button>
              )}
            </li>
          ))}
        </ul>
        )}
      </section>
    </div>
  )
}

export default AdminScreen
