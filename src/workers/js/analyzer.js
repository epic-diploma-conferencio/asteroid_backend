const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const {
  createAnalysisEnvelope,
  addEntity,
  addRelation,
  finalizeAnalysis
} = require('../../shared/analysis-schema')

function getFunctionName(path) {
  if (path.node.id?.name) return path.node.id.name

  const parent = path.parent
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) return parent.id.name
  if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'Identifier') return parent.left.name
  if (parent?.type === 'ObjectProperty' && parent.key?.name) return parent.key.name

  return `<anonymous:${path.node.start}>`
}

function getParamName(param) {
  if (!param) return '<unknown>'
  if (param.type === 'Identifier') return param.name
  if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') return param.left.name
  if (param.type === 'RestElement' && param.argument.type === 'Identifier') return `...${param.argument.name}`
  return '<complex-param>'
}

function getCalleeName(node) {
  if (!node) return '<unknown>'
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') {
    const objectName = node.object?.name || '<expr>'
    const propertyName = node.property?.name || '<member>'
    return `${objectName}.${propertyName}`
  }
  if (node.type === 'Import') return 'import'
  return node.type || '<unknown>'
}

function getImportBindings(specifiers = []) {
  return specifiers.map(specifier => {
    if (specifier.type === 'ImportSpecifier') {
      return {
        imported: specifier.imported?.name || specifier.imported?.value || '<unknown>',
        local: specifier.local?.name || '<unknown>',
        kind: 'named'
      }
    }

    if (specifier.type === 'ImportDefaultSpecifier') {
      return {
        imported: 'default',
        local: specifier.local?.name || 'default',
        kind: 'default'
      }
    }

    if (specifier.type === 'ImportNamespaceSpecifier') {
      return {
        imported: '*',
        local: specifier.local?.name || '<namespace>',
        kind: 'namespace'
      }
    }

    return {
      imported: '<unknown>',
      local: '<unknown>',
      kind: 'unknown'
    }
  })
}

function analyzeJavaScript(code, metadata = {}) {
  const analysis = createAnalysisEnvelope('javascript', 'babel', metadata)
  const functionStack = []
  const moduleId = analysis.module.id

  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    errorRecovery: true,
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'decorators-legacy',
      'dynamicImport'
    ]
  })

  analysis.diagnostics = ast.errors.map(error => ({
    severity: 'warning',
    message: error.message,
    position: error.loc || null
  }))

  traverse(ast, {
    FunctionDeclaration: {
      enter(path) {
        const name = getFunctionName(path)
        const entityId = `${moduleId}:function:${name}`
        const parentId = functionStack[functionStack.length - 1] || moduleId

        addEntity(analysis, {
          id: entityId,
          kind: 'function',
          name,
          parentId,
          data: {
            params: path.node.params.map(getParamName),
            runtimeKind: 'FunctionDeclaration'
          }
        })

        addRelation(analysis, {
          id: `${parentId}->${entityId}:contains`,
          from: parentId,
          to: entityId,
          kind: 'contains',
          data: {}
        })

        functionStack.push(entityId)
      },
      exit() {
        functionStack.pop()
      }
    },
    FunctionExpression: {
      enter(path) {
        const name = getFunctionName(path)
        const entityId = `${moduleId}:function:${name}`
        const parentId = functionStack[functionStack.length - 1] || moduleId

        addEntity(analysis, {
          id: entityId,
          kind: 'function',
          name,
          parentId,
          data: {
            params: path.node.params.map(getParamName),
            runtimeKind: 'FunctionExpression'
          }
        })

        addRelation(analysis, {
          id: `${parentId}->${entityId}:contains`,
          from: parentId,
          to: entityId,
          kind: 'contains',
          data: {}
        })

        functionStack.push(entityId)
      },
      exit() {
        functionStack.pop()
      }
    },
    ArrowFunctionExpression: {
      enter(path) {
        const name = getFunctionName(path)
        const entityId = `${moduleId}:function:${name}`
        const parentId = functionStack[functionStack.length - 1] || moduleId

        addEntity(analysis, {
          id: entityId,
          kind: 'function',
          name,
          parentId,
          data: {
            params: path.node.params.map(getParamName),
            runtimeKind: 'ArrowFunctionExpression'
          }
        })

        addRelation(analysis, {
          id: `${parentId}->${entityId}:contains`,
          from: parentId,
          to: entityId,
          kind: 'contains',
          data: {}
        })

        functionStack.push(entityId)
      },
      exit() {
        functionStack.pop()
      }
    },
    ImportDeclaration(path) {
      addRelation(analysis, {
        id: `${moduleId}->import:${path.node.source.value}`,
        from: moduleId,
        to: `external:${path.node.source.value}`,
        kind: 'imports',
        data: {
          specifier: path.node.source.value,
          bindings: getImportBindings(path.node.specifiers)
        }
      })
    },
    VariableDeclarator(path) {
      if (path.node.id.type !== 'Identifier') return

      const entityId = `${moduleId}:variable:${path.node.id.name}:${path.node.start}`
      const parentId = functionStack[functionStack.length - 1] || moduleId

      addEntity(analysis, {
        id: entityId,
        kind: 'variable',
        name: path.node.id.name,
        parentId,
        data: {
          runtimeKind: 'VariableDeclarator'
        }
      })

      addRelation(analysis, {
        id: `${parentId}->${entityId}:contains`,
        from: parentId,
        to: entityId,
        kind: 'contains',
        data: {}
      })
    },
    CallExpression(path) {
      const currentFunctionId = functionStack[functionStack.length - 1] || null
      if (!currentFunctionId) return

      const calleeName = getCalleeName(path.node.callee)

      addRelation(analysis, {
        id: `${currentFunctionId}->call:${calleeName}:${path.node.start}`,
        from: currentFunctionId,
        to: `call:${calleeName}`,
        kind: 'calls',
        data: {
          callee: calleeName
        }
      })
    }
  })

  return finalizeAnalysis(analysis)
}

module.exports = {
  analyzeJavaScript
}
