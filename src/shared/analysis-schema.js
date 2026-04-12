function createModuleInfo(metadata = {}, language) {
  const moduleId = `module:${metadata.objectKey || metadata.originalName || metadata.hash || 'unknown'}`

  return {
    id: moduleId,
    name: metadata.originalName || metadata.objectKey || 'unknown',
    path: metadata.originalName || metadata.objectKey || 'unknown',
    hash: metadata.hash || null,
    language
  }
}

function createAnalysisEnvelope(language, parser, metadata = {}) {
  const module = createModuleInfo(metadata, language)

  return {
    schemaVersion: '2.0.0',
    language,
    parser,
    module,
    summary: {
      modules: 1,
      entities: 0,
      relations: 0,
      imports: 0,
      calls: 0,
      diagnostics: 0
    },
    entities: [
      {
        id: module.id,
        kind: 'module',
        name: module.name,
        parentId: null,
        data: {
          path: module.path,
          hash: module.hash
        }
      }
    ],
    relations: [],
    diagnostics: []
  }
}

function addEntity(analysis, entity) {
  analysis.entities.push(entity)
  return entity
}

function addRelation(analysis, relation) {
  analysis.relations.push(relation)
  return relation
}

function finalizeAnalysis(analysis) {
  analysis.summary = {
    modules: 1,
    entities: analysis.entities.length,
    relations: analysis.relations.length,
    imports: analysis.relations.filter(relation => relation.kind === 'imports').length,
    calls: analysis.relations.filter(relation => relation.kind === 'calls').length,
    diagnostics: analysis.diagnostics.length
  }

  return analysis
}

module.exports = {
  createAnalysisEnvelope,
  addEntity,
  addRelation,
  finalizeAnalysis
}
