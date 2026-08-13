import { describe, expect, it } from 'vitest'
import { validateProductionConfig } from './production-config.mjs'

function validConfig() {
  return {
    name: 'ranger-outpost-hub',
    d1_databases: [{
      binding: 'DB',
      database_name: 'ranger-outpost-hub',
      database_id: '00000000-0000-0000-0000-000000000000',
    }],
    env: {
      production: {
        name: 'ranger-outpost-hub-production',
        workers_dev: true,
        triggers: { crons: ['7,37 * * * *'] },
        d1_databases: [{
          binding: 'DB',
          database_name: 'ranger-outpost-hub-production',
          database_id: '12345678-1234-4234-8234-123456789abc',
          migrations_dir: 'migrations',
        }],
        observability: {
          enabled: true,
          logs: { enabled: true, invocation_logs: false, persist: true, head_sampling_rate: 0.1 },
        },
      },
    },
  }
}

describe('production Wrangler configuration', () => {
  it('accepts one real remote D1 binding without the local Operator bypass', () => {
    expect(validateProductionConfig(validConfig())).toEqual({
      databaseName: 'ranger-outpost-hub-production',
      workerName: 'ranger-outpost-hub-production',
      maintenanceCron: '7,37 * * * *',
    })
  })

  it.each([
    ['a missing production D1 binding', (config) => { delete config.env.production.d1_databases }],
    ['an all-zero production D1 ID', (config) => { config.env.production.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000000' }],
    ['an inherited local bypass', (config) => { config.vars = { LOCAL_OPERATOR_PREVIEW: 'true' } }],
    ['a production local bypass', (config) => { config.env.production.vars = { LOCAL_OPERATOR_PREVIEW: 'true' } }],
    ['a public-intake local bypass', (config) => { config.env.production.vars = { LOCAL_PUBLIC_INTAKE_BYPASS: 'true' } }],
    ['an ordinary-auth local email bypass', (config) => { config.env.production.vars = { LOCAL_AUTH_EMAIL_PREVIEW: 'true' } }],
    ['a committed Turnstile secret', (config) => { config.env.production.vars = { TURNSTILE_SECRET_KEY: 'secret' } }],
    ['a committed ordinary auth secret', (config) => { config.env.production.vars = { AUTH_SECRET: 'secret' } }],
    ['a committed lifecycle activation flag', (config) => { config.env.production.vars = { ORDINARY_ACCOUNT_LIFECYCLE_ENABLED: 'true' } }],
    ['automatic invocation logs that retain request URLs', (config) => { config.env.production.observability.logs.invocation_logs = true }],
    ['a missing maintenance Cron', (config) => { delete config.env.production.triggers }],
    ['an extra maintenance Cron', (config) => { config.env.production.triggers.crons.push('0 0 * * *') }],
  ])('rejects %s', (_label, mutate) => {
    const config = validConfig()
    mutate(config)
    expect(() => validateProductionConfig(config)).toThrow()
  })
})
