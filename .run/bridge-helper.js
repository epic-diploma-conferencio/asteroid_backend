export function bridgeHelper(name) {
  return name.trim().replace(/\s+/g, '-')
}

export function bridgeSuffix(value) {
  return `${value}-ts`
}
