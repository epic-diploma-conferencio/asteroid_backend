const path = require('path')

const LANGUAGE_BY_EXTENSION = {
  '.js': 'javascript',
  '.cjs': 'javascript',
  '.mjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin'
}

function detectLanguage(filename) {
  const extension = path.extname(filename || '').toLowerCase()
  return LANGUAGE_BY_EXTENSION[extension] || null
}

function buildObjectKey(hash, originalName) {
  const extension = path.extname(originalName || '').toLowerCase()
  return `${hash}${extension}`
}

function buildResultObjectKey(hash) {
  return `${hash}.json`
}

module.exports = {
  detectLanguage,
  buildObjectKey,
  buildResultObjectKey
}
