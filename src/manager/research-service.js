const { readObjectAsBuffer } = require('../shared/minio')
const config = require('../shared/config')
const { aggregateAnalyses } = require('./graph-service')
const { RULES_BY_NAME, RULES, RULE_STYLE } = require('../shared/rules-catalog')
const { createUuid } = require('./auth-utils')

function toIso(value) {
  return value instanceof Date ? value.toISOString() : String(value)
}

function statusTone(score) {
  if (score < 40) return 'danger'
  if (score >= 75) return 'success'
  return 'neutral'
}

function threshold(style) {
  if (style === RULE_STYLE.STRICT) return 0.65
  if (style === RULE_STYLE.SOFT) return 1.35
  return 1
}

function calcGraphMetrics(graph) {
  const nodes = graph.nodes || []
  const edges = graph.edges || []
  const moduleNodes = nodes.filter(node => node.kind === 'module')
  const callEdges = edges.filter(edge => edge.kind === 'calls' || edge.kind === 'cross-module-call')
  const importEdges = edges.filter(edge => edge.kind === 'imports' || edge.kind === 'module-import' || edge.kind === 'symbol-import')

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    moduleCount: moduleNodes.length,
    importEdgeCount: importEdges.length,
    callEdgeCount: callEdges.length,
    density: nodes.length > 1 ? Number((edges.length / (nodes.length * (nodes.length - 1))).toFixed(4)) : 0
  }
}

function evaluateRule(ruleName, graph, style) {
  const m = calcGraphMetrics(graph)
  const k = threshold(style)

  const checks = {
    structure_analysis: () => {
      const missingModuleSignals = Math.max(0, 3 - m.moduleCount)
      const penalty = (missingModuleSignals * 15 + (m.totalNodes < 10 ? 10 : 0)) * k
      return 100 - penalty
    },
    architecture_analysis: () => {
      const ratio = m.moduleCount ? m.callEdgeCount / Math.max(m.moduleCount, 1) : m.callEdgeCount
      return 100 - Math.min(85, ratio * 9 * k)
    },
    dependency_analysis: () => {
      const ratio = m.importEdgeCount / Math.max(m.totalNodes || 1, 1)
      return 100 - Math.min(90, ratio * 18 * k)
    },
    build_analysis: () => {
      const risk = Math.max(0, 4 - m.moduleCount) * 10 + (m.importEdgeCount === 0 ? 20 : 0)
      return 100 - risk * k
    },
    lint_analysis: () => {
      const noisyGraph = m.density > 0.12 ? 22 : 8
      return 100 - noisyGraph * k
    },
    unused_analysis: () => {
      const dangling = Math.max(0, m.totalNodes - m.callEdgeCount - m.importEdgeCount)
      return 100 - Math.min(90, dangling * 2.5 * k)
    },
    vulnerability_analysis: () => {
      const risky = m.importEdgeCount > m.moduleCount * 4 ? 30 : 12
      return 100 - risky * k
    },
    complexity_analysis: () => {
      const weight = m.callEdgeCount * 1.7 + m.density * 120
      return 100 - Math.min(92, weight * k)
    }
  }

  const score = Math.max(0, Math.min(100, Number((checks[ruleName]?.() ?? 55).toFixed(1))))
  return {
    score,
    status: score >= 75 ? 'passed' : score >= 50 ? 'warning' : 'failed',
    severity: score >= 75 ? 'low' : score >= 50 ? 'medium' : 'high',
    metrics: m
  }
}

function buildCards(ruleResults) {
  return ruleResults.map((result, index) => {
    const kindByGroup = result.group === 'group-a' ? ['structure', 'arch', 'deps', 'ast'] : ['ast', 'deps', 'arch', 'structure']
    return {
      id: `card-${index + 1}-${result.ruleName}`,
      kind: kindByGroup[index % kindByGroup.length],
      title: result.ruleRussian,
      stat: {
        label: 'Оценка',
        value: `${result.score}/100`,
        tone: statusTone(result.score)
      },
      preview: result.status === 'passed'
        ? 'Критерий пройден, критичных сигналов не найдено.'
        : result.status === 'warning'
          ? 'Есть предупреждения, стоит проверить отмеченные зоны.'
          : 'Найдены значимые риски, требуется дополнительный разбор.',
      files: []
    }
  })
}

class ResearchService {
  constructor(pool) {
    this.pool = pool
  }

  async createSessionFromJob({ job, sourceName, fileCount, userId }) {
    const sessionId = createUuid()
    let analysisPayload = null
    let graphPayload = null

    if (job?.resultObjectKey) {
      const buffer = await readObjectAsBuffer(config.minio.resultBucket, job.resultObjectKey)
      const parsed = JSON.parse(buffer.toString('utf8'))
      analysisPayload = parsed.analysis || null
      graphPayload = analysisPayload ? aggregateAnalyses([analysisPayload]) : { nodes: [], edges: [], modules: [] }
    }

    await this.pool.query(
      `
      INSERT INTO research_sessions (
        session_id, user_id, source_name, language, file_count, job_id, result_object_key,
        graph_payload, analysis_payload, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        sessionId,
        userId || null,
        sourceName,
        job.language || 'unknown',
        fileCount,
        job.jobId,
        job.resultObjectKey || null,
        graphPayload ? JSON.stringify(graphPayload) : null,
        analysisPayload ? JSON.stringify(analysisPayload) : null,
        job.status === 'COMPLETED' ? 'completed' : 'processing'
      ]
    )

    return {
      sessionId,
      language: job.language || 'unknown',
      archiveName: sourceName,
      fileCount
    }
  }

  getAvailableRules() {
    return RULES.map(rule => ({
      ruleName: rule.ruleName,
      ruleRussian: rule.ruleRussian,
      ruleDescription: rule.ruleDescription
    }))
  }

  async startAnalysis({ userId, uploadId, rules, style }) {
    const selected = (rules || []).filter(rule => rule?.value && RULES_BY_NAME.has(rule.ruleName))
    if (!selected.length) {
      throw new Error('At least one valid rule is required.')
    }

    const sessionRes = await this.pool.query(
      'SELECT * FROM research_sessions WHERE session_id = $1',
      [uploadId]
    )

    const session = sessionRes.rows[0]
    if (!session) {
      throw new Error('Upload session not found.')
    }

    const graph = session.graph_payload || { nodes: [], edges: [], modules: [] }
    const appliedStyle = [RULE_STYLE.SOFT, RULE_STYLE.BALANCED, RULE_STYLE.STRICT].includes(style)
      ? style
      : RULE_STYLE.BALANCED

    const ruleResults = selected.map(({ ruleName }) => {
      const meta = RULES_BY_NAME.get(ruleName)
      const evaluation = evaluateRule(ruleName, graph, appliedStyle)
      return {
        ruleName,
        ruleRussian: meta.ruleRussian,
        group: meta.group,
        style: appliedStyle,
        ...evaluation
      }
    })

    const groupA = ruleResults.filter(rule => rule.group === 'group-a')
    const groupB = ruleResults.filter(rule => rule.group === 'group-b')

    const graphByRules = {
      formatVersion: '1.0',
      style: appliedStyle,
      selectedRuleNames: ruleResults.map(rule => rule.ruleName),
      groups: {
        groupA,
        groupB
      }
    }

    const graphOverview = {
      formatVersion: '1.0',
      summary: calcGraphMetrics(graph),
      graph
    }

    const researchId = createUuid()
    const cards = buildCards(ruleResults)
    const preview = `Проверено правил: ${ruleResults.length}. Стиль: ${appliedStyle}.`

    await this.pool.query(
      `
      INSERT INTO researches (
        id, user_id, session_id, name, description, language, status, preview,
        rule_style, selected_rules, graph_overview, graph_by_rules, cards, is_saved
      )
      VALUES ($1,$2,$3,$4,$5,$6,'completed',$7,$8,$9,$10,$11,$12,true)
      `,
      [
        researchId,
        userId || session.user_id || null,
        session.session_id,
        `Исследование ${new Date().toLocaleString('ru-RU')}`,
        null,
        session.language,
        preview,
        appliedStyle,
        JSON.stringify(selected),
        JSON.stringify(graphOverview),
        JSON.stringify(graphByRules),
        JSON.stringify(cards)
      ]
    )

    return {
      researchId,
      status: 'completed'
    }
  }

  mapResearchRow(row, ownerId) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerEmail: row.owner_login || null,
      ownerIsMe: Boolean(ownerId) && Number(row.user_id) === Number(ownerId),
      isSaved: row.is_saved,
      language: row.language,
      createdAt: toIso(row.created_at),
      preview: row.preview,
      status: row.status
    }
  }

  async listSaved(userId) {
    if (!userId) return []
    const result = await this.pool.query(
      `
      SELECT r.*, u.login AS owner_login
      FROM researches r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      `,
      [userId]
    )

    return result.rows.map(row => this.mapResearchRow(row, userId))
  }

  async getResearch(id, userId) {
    const result = await this.pool.query(
      `
      SELECT r.*, u.login AS owner_login
      FROM researches r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = $1
      `,
      [id]
    )

    const row = result.rows[0]
    if (!row) return null

    if (userId && Number(row.user_id) !== Number(userId)) {
      return null
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerIsMe: userId ? Number(row.user_id) === Number(userId) : false,
      isSaved: row.is_saved,
      status: row.status,
      language: row.language,
      createdAt: toIso(row.created_at),
      preview: row.preview,
      cards: row.cards || [],
      graphOverview: row.graph_overview || {},
      graphByRules: row.graph_by_rules || {},
      selectedRules: row.selected_rules || [],
      ruleStyle: row.rule_style
    }
  }

  async getResearchPublic(id, userId) {
    return this.getResearch(id, userId || null)
  }

  async updateResearch(id, userId, patch) {
    const current = await this.getResearch(id, userId)
    if (!current) return null

    const nextName = typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : current.name
    const nextDescription = patch.description === undefined ? current.description : patch.description

    await this.pool.query(
      `
      UPDATE researches
      SET name = $2,
          description = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [id, nextName, nextDescription]
    )

    return this.getResearch(id, userId)
  }

  async deleteResearch(id, userId) {
    const result = await this.pool.query(
      'DELETE FROM researches WHERE id = $1 AND user_id = $2',
      [id, userId]
    )
    return result.rowCount > 0
  }
}

module.exports = {
  ResearchService
}