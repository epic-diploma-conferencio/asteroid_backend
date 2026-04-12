import { bridgeHelper, bridgeSuffix } from './bridge-helper.js'

export function bridgeLabel(user: string) {
  const normalized = bridgeHelper(user)
  return bridgeSuffix(normalized)
}
