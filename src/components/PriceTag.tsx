export function money(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export function PriceTag({ price, currency, big }: { price: number | null; currency?: string | null; big?: boolean }) {
  const cls = `price-tag${big ? ' big' : ''}${price == null ? ' none' : ''}`
  return <span className={cls}>{price == null ? 'No price yet' : money(price, currency ?? 'USD')}</span>
}
