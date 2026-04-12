import { helper, suffix } from './helper-cross.js'

export function buildLabel(user: string) {
  const normalized = helper(user)
  return suffix(normalized)
}
