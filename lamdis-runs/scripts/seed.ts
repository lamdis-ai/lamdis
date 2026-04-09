import 'dotenv/config'
import mongoose from 'mongoose'
import { TestSuiteModel } from '../src/models/TestSuite.js'
import { EnvironmentModel } from '../src/models/Environment.js'
import { PersonaModel } from '../src/models/Persona.js'
import { TestModel } from '../src/models/Test.js'
import { ActionModel } from '../src/models/Action.js'
import { OrganizationModel } from '../src/models/Organization.js'

async function main() {
  const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/lamdis'
  await mongoose.connect(MONGO_URL)

  // Minimal org (optional)
  const org = await OrganizationModel.create({ name: 'Standalone Org' })

  // Suite
  const suite = await TestSuiteModel.create({ orgId: String(org._id), name: 'Quickstart Suite', thresholds: { passRate: 0.9, judgeScore: 0.7 } })

  // Environment (now just a label)
  const env = await EnvironmentModel.create({ orgId: String(org._id), suiteId: String(suite._id), key: 'local', name: 'Local Dev' })

  // Persona (optional)
  const persona = await PersonaModel.create({ orgId: String(org._id), name: 'Basic', text: 'You are a helpful assistant. Keep answers concise.' })

  // Actions used by hooks/assertions (optional)
  await ActionModel.create({
    orgId: org._id as any,
    id: 'ping',
    title: 'Ping',
    method: 'GET',
    path: '/get',
  } as any)

  // Simple Test
  const test = await TestModel.create({
    orgId: String(org._id),
    suiteId: String(suite._id),
    name: 'Say hello',
    personaId: String(persona._id),
    objective: 'Greet the user politely.',
    script: { messages: [{ role: 'user', content: 'Hi there' }] },
    assertions: [
      { type: 'includes', severity: 'error', config: { scope: 'last', includes: ['hello','hi'] } },
      { type: 'semantic', severity: 'error', config: { rubric: 'Greet politely in one sentence.', threshold: 0.7 } }
    ],
    maxTurns: 2,
    iterate: false
  })

  console.log('Seeded:')
  console.log(' orgId:', String(org._id))
  console.log(' suiteId:', String(suite._id))
  console.log(' envId:', String(env._id))
  console.log(' personaId:', String(persona._id))
  console.log(' testId:', String(test._id))

  await mongoose.disconnect()
}

main().catch((e)=>{ console.error(e); process.exit(1) })
