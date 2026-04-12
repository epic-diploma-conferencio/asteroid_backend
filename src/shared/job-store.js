class InMemoryJobStore {
  constructor() {
    this.jobs = new Map()
  }

  create(job) {
    this.jobs.set(job.jobId, job)
    return job
  }

  update(jobId, patch) {
    const current = this.jobs.get(jobId)
    if (!current) return null

    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }

    this.jobs.set(jobId, next)
    return next
  }

  get(jobId) {
    return this.jobs.get(jobId) || null
  }

  list() {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}

module.exports = {
  InMemoryJobStore
}
