const RULE_STYLE = {
  SOFT: 'soft',
  BALANCED: 'balanced',
  STRICT: 'strict'
}

const RULE_GROUP = {
  A: 'group-a',
  B: 'group-b'
}

const RULES = [
  {
    ruleName: 'structure_analysis',
    ruleRussian: 'Структурный анализ',
    ruleDescription: 'Проверка разбиения проекта на ожидаемые слои и директории.',
    group: RULE_GROUP.A
  },
  {
    ruleName: 'architecture_analysis',
    ruleRussian: 'Архитектурный анализ',
    ruleDescription: 'Поиск нежелательных связей между модулями и слоями.',
    group: RULE_GROUP.A
  },
  {
    ruleName: 'dependency_analysis',
    ruleRussian: 'Анализ зависимостей проекта',
    ruleDescription: 'Проверка связности зависимостей и потенциально критичных импортов.',
    group: RULE_GROUP.A
  },
  {
    ruleName: 'build_analysis',
    ruleRussian: 'Анализ билда проекта',
    ruleDescription: 'Проверка build-конфигов и связности импортов для запуска.',
    group: RULE_GROUP.A
  },
  {
    ruleName: 'lint_analysis',
    ruleRussian: 'Линт-анализ',
    ruleDescription: 'Поиск style issues и потенциально проблемных мест.',
    group: RULE_GROUP.B
  },
  {
    ruleName: 'unused_analysis',
    ruleRussian: 'Анализ неиспользуемых переменных',
    ruleDescription: 'Выявление неиспользуемых импортов, переменных и параметров.',
    group: RULE_GROUP.B
  },
  {
    ruleName: 'vulnerability_analysis',
    ruleRussian: 'Анализ уязвимостей в проекте',
    ruleDescription: 'Оценка рисков по зависимостям и техническим сигналам.',
    group: RULE_GROUP.B
  },
  {
    ruleName: 'complexity_analysis',
    ruleRussian: 'Анализ сложности кода',
    ruleDescription: 'Поиск сложных и тяжело поддерживаемых участков.',
    group: RULE_GROUP.B
  }
]

const RULES_BY_NAME = new Map(RULES.map(rule => [rule.ruleName, rule]))

module.exports = {
  RULES,
  RULES_BY_NAME,
  RULE_STYLE,
  RULE_GROUP
}