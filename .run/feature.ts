import type { User } from './types'

export function pickName(user: User): string {
  return user.name
}
