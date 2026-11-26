export function toISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return `${m}/${d}`
}

export function chineseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const date = new Date(y, m - 1, d)
  return `${y} 年 ${m} 月 ${d} 日 · ${week[date.getDay()]}`
}

export const TODAY = toISO()
export const TOMORROW = addDays(TODAY, 1)
