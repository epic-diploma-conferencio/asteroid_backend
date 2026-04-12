const path = require('path')
const config = require('../shared/config')
const { readObjectAsBuffer, listObjectKeys } = require('../shared/minio')

function normalizeImportSpecifier(specifier) {
  if (!specifier || typeof specifier !== 'string') return null
  return specifier.replace(/\\/g, '/')
}

function resolveLocalCandidates(specifier, language) {
  const normalized = normalizeImportSpecifier(specifier)
  if (!normalized) return []

  const candidates = new Set([normalized])
  const ext = path.extname(normalized)

  if (!ext) {
    const preferredSuffixes = language === 'python'
      ? ['.py']
      : language === 'typescript'
        ? ['.ts', '.tsx', '.js', '.jsx']
        : ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']

    for (const suffix of preferredSuffixes) {
      candidates.add(`${normalized}${suffix}`)
      candidates.add(`${normalized}/index${suffix}`)
    }
  }

  return Array.from(candidates)
}

function buildModuleLookup(analyses) {
  const byPath = new Map()
  const byBasename = new Map()

  for (const analysis of analyses) {
    const modulePath = analysis.module?.path
    const moduleId = analysis.module?.id
    if (!modulePath || !moduleId) continue

    byPath.set(modulePath.replace(/\\/g, '/'), moduleId)
    byBasename.set(path.basename(modulePath).replace(/\\/g, '/'), moduleId)
  }

  return { byPath, byBasename }
}

function buildEntityLookup(analyses) {
  const byModule = new Map()

  for (const analysis of analyses) {
    const moduleId = analysis.module?.id
    if (!moduleId) continue

    const entities = analysis.entities || []
    const localMap = new Map()

    for (const entity of entities) {
      if (!entity?.name || entity.kind === 'module') continue
      if (!localMap.has(entity.name)) {
        localMap.set(entity.name, [])
      }
      localMap.get(entity.name).push(entity)
    }

    byModule.set(moduleId, localMap)
  }

  return byModule
}

function resolveImportedEntityId(binding, targetModuleId, entityLookup) {
  if (!binding || !targetModuleId) return null

  const moduleEntities = entityLookup.get(targetModuleId)
  if (!moduleEntities) return null

  if (binding.kind === 'namespace' || binding.kind === 'module') {
    return targetModuleId
  }

  const preferredNames = [binding.imported, binding.local].filter(Boolean)

  for (const name of preferredNames) {
    const matches = moduleEntities.get(name)
    if (matches?.length) {
      const preferred = matches.find(entity => entity.kind === 'function')
        || matches.find(entity => entity.kind === 'class')
        || matches[0]
      return preferred.id
    }
  }

  return null
}

function aggregateAnalyses(analyses) {
  const graph = {
    nodes: [],
    edges: [],
    modules: analyses.map(analysis => analysis.module).filter(Boolean)
  }

  const { byPath, byBasename } = buildModuleLookup(analyses)
  const entityLookup = buildEntityLookup(analyses)
  const seenNodeIds = new Set()
  const seenEdgeIds = new Set()
  const importedBindingsByModule = new Map()

  for (const analysis of analyses) {
    for (const entity of analysis.entities || []) {
      if (seenNodeIds.has(entity.id)) continue
      seenNodeIds.add(entity.id)
      graph.nodes.push({
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        parentId: entity.parentId || null,
        moduleId: analysis.module?.id || null,
        data: entity.data || {}
      })
    }

    for (const relation of analysis.relations || []) {
      const edgeId = `${relation.from}->${relation.to}:${relation.kind}`
      if (seenEdgeIds.has(edgeId)) continue
      seenEdgeIds.add(edgeId)
      graph.edges.push(relation)
    }
  }

  for (const analysis of analyses) {
    for (const relation of analysis.relations || []) {
      if (relation.kind !== 'imports') continue

      const candidates = resolveLocalCandidates(relation.data?.specifier, analysis.module?.language)
      const localTargetId = candidates
        .map(candidate => byPath.get(candidate) || byBasename.get(path.basename(candidate)))
        .find(Boolean)

      if (!localTargetId) continue

      const edgeId = `${analysis.module.id}->${localTargetId}:module-import`
      if (seenEdgeIds.has(edgeId)) continue
      seenEdgeIds.add(edgeId)
      graph.edges.push({
        id: edgeId,
        from: analysis.module.id,
        to: localTargetId,
        kind: 'module-import',
        data: {
          specifier: relation.data?.specifier || null
        }
      })

      const bindings = relation.data?.bindings || []
      const bindingMap = importedBindingsByModule.get(analysis.module.id) || new Map()

      for (const binding of bindings) {
        const importedEntityId = resolveImportedEntityId(binding, localTargetId, entityLookup)
        if (!importedEntityId) continue

        const symbolEdgeId = `${analysis.module.id}->${importedEntityId}:symbol-import:${binding.local}`
        if (!seenEdgeIds.has(symbolEdgeId)) {
          seenEdgeIds.add(symbolEdgeId)
          graph.edges.push({
            id: symbolEdgeId,
            from: analysis.module.id,
            to: importedEntityId,
            kind: 'symbol-import',
            data: {
              specifier: relation.data?.specifier || null,
              imported: binding.imported || null,
              local: binding.local || null,
              importKind: binding.kind || null,
              targetModuleId: localTargetId
            }
          })
        }

        if (binding.local) {
          bindingMap.set(binding.local, {
            targetEntityId: importedEntityId,
            targetModuleId: localTargetId,
            imported: binding.imported || null,
            specifier: relation.data?.specifier || null,
            importKind: binding.kind || null
          })
        }
      }

      importedBindingsByModule.set(analysis.module.id, bindingMap)
    }
  }

  for (const analysis of analyses) {
    const bindingMap = importedBindingsByModule.get(analysis.module?.id)
    if (!bindingMap?.size) continue

    for (const relation of analysis.relations || []) {
      if (relation.kind !== 'calls') continue

      const callee = relation.data?.callee
      if (!callee) continue

      const rootName = callee.split('.')[0]
      const resolved = bindingMap.get(callee) || bindingMap.get(rootName)
      if (!resolved?.targetEntityId) continue

      const edgeId = `${relation.from}->${resolved.targetEntityId}:cross-module-call:${callee}`
      if (seenEdgeIds.has(edgeId)) continue
      seenEdgeIds.add(edgeId)
      graph.edges.push({
        id: edgeId,
        from: relation.from,
        to: resolved.targetEntityId,
        kind: 'cross-module-call',
        data: {
          callee,
          importedAs: rootName,
          imported: resolved.imported,
          specifier: resolved.specifier,
          importKind: resolved.importKind,
          targetModuleId: resolved.targetModuleId
        }
      })
    }
  }

  return graph
}

async function loadCompletedAnalyses() {
  const objectKeys = await listObjectKeys(config.minio.resultBucket)
  const analyses = []

  for (const objectKey of objectKeys.filter(key => key.endsWith('.json'))) {
    const buffer = await readObjectAsBuffer(config.minio.resultBucket, objectKey)
    const payload = JSON.parse(buffer.toString('utf8'))
    if (payload.analysis) {
      analyses.push(payload.analysis)
    }
  }

  return analyses
}

module.exports = {
  aggregateAnalyses,
  loadCompletedAnalyses
}
