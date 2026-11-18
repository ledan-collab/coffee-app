export function formatPrice(amount) {
  return `${amount.toLocaleString('ko-KR')}원`
}

export function formatOrderTime(date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${hours}:${minutes}`
}

export function stockStatus(count) {
  if (count === 0) {
    return { label: '품절', tone: 'out' }
  }
  if (count < 5) {
    return { label: '주의', tone: 'low' }
  }
  return { label: '정상', tone: 'ok' }
}
