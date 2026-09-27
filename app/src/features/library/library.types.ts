export type LayoutMode = 'compact' | 'comfortable' | 'grid'
export type SortMode = 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'

export interface Filters {
  typeId: string
  tagIds: string[]
  createdToday: boolean
  updatedToday: boolean
  trashOnly: boolean
}
