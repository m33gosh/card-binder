import { Link } from 'react-router-dom'
import type { CardRow } from '@/features/cards/types'
import { PriceTag } from './PriceTag'

export function CardTile({ card, photoUrl, stat }: { card: CardRow; photoUrl?: string; stat?: string }) {
  // Official art when we have a match; the owner's photo otherwise.
  const src = card.api_image_url ?? photoUrl
  return (
    <Link to={`/cards/${card.id}`} className="card-tile">
      <div className={`art${src ? '' : ' empty'}`}>
        {src ? <img src={src} alt={card.name} loading="lazy" /> : <span>No photo</span>}
      </div>
      <PriceTag price={card.market_price} currency={card.price_currency} />
      <div className="name">{card.name}</div>
      <div className="meta">{stat ?? [card.quantity > 1 && `×${card.quantity}`, card.set_name, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}</div>
    </Link>
  )
}
