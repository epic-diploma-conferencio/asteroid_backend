import { helperLink, makeBadge } from './helper-link.js'

export function renderLabel(user: string) {
  const normalized = helperLink(user)
  return makeBadge(normalized)
}
