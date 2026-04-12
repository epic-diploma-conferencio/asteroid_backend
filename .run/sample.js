function outer(a) {
  const helper = (b) => b + 1
  return helper(a)
}
module.exports = { outer }
