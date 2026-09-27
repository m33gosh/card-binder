export type SquishCondition = 'new_with_tags' | 'like_new' | 'loved' | 'well_loved'

export const SQUISH_CONDITIONS: Record<SquishCondition, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  loved: 'Loved',
  well_loved: 'Well loved',
}

export const BRANDS = ['Squishmallows', 'NeeDoh', 'Squishies', 'Jellycat', 'Other']

export interface SquishRow {
  id: string
  owner_id: string
  name: string
  brand: string | null
  character: string | null
  squad: string | null
  size_inches: number | null
  color: string | null
  acquired_from: string | null
  acquired_on: string | null
  price_paid: number | null
  value: number | null
  condition: SquishCondition
  favorite: boolean
  wishlist: boolean
  notes: string | null
  image_path: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export type SquishInput = Omit<SquishRow, 'id' | 'owner_id' | 'created_at' | 'updated_at'>

export const EMPTY_SQUISH: SquishInput = {
  name: '',
  brand: 'Squishmallows',
  character: null,
  squad: null,
  size_inches: null,
  color: null,
  acquired_from: null,
  acquired_on: null,
  price_paid: null,
  value: null,
  condition: 'like_new',
  favorite: false,
  wishlist: false,
  notes: null,
  image_path: null,
  image_url: null,
}
