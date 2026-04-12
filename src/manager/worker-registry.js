const config = require('../shared/config')

const WORKER_DEFINITIONS = {
  javascript: {
    language: 'javascript',
    workerName: 'worker-js',
    endpoint: `${config.workers.javascript}/process`
  },
  typescript: {
    language: 'typescript',
    workerName: 'worker-typescript',
    endpoint: `${config.workers.typescript}/process`
  },
  python: {
    language: 'python',
    workerName: 'worker-python',
    endpoint: `${config.workers.python}/process`
  },
  java: {
    language: 'java',
    workerName: 'worker-java',
    endpoint: null
  },
  kotlin: {
    language: 'kotlin',
    workerName: 'worker-kotlin',
    endpoint: null
  }
}

function resolveWorker(language) {
  return WORKER_DEFINITIONS[language] || null
}

module.exports = {
  resolveWorker,
  WORKER_DEFINITIONS
}
