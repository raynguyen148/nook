import { cn as merge } from 'cn'

export function cn(...classes: Parameters<typeof merge>) {
  return merge(...classes)
}
