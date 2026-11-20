import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler, { isAuthorized, dispatchSync } from '../api/tick.js'

function fakeFetch(status = 204, body = '') {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return { status, text: async () => body }
  }
  return { impl, calls }
}

function fakeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => {
    res.body = body
    return res
  }
  return res
}

test('autoriza so com o Bearer exato do CRON_SECRET', () => {
  assert.equal(isAuthorized('Bearer abc', 'abc'), true)
  assert.equal(isAuthorized('Bearer abd', 'abc'), false)
  assert.equal(isAuthorized(undefined, 'abc'), false)
  assert.equal(isAuthorized('Bearer ', ''), false)
  assert.equal(isAuthorized('Bearer undefined', undefined), false)
})

test('dispara o workflow sync.yml na main com o token', async () => {
  const { impl, calls } = fakeFetch(204)
  await dispatchSync({ token: 'tok', fetchImpl: impl })
  assert.equal(calls.length, 1)
  assert.equal(
    calls[0].url,
    'https://api.github.com/repos/Mandl-Creative/nirvana-careers-sync/actions/workflows/sync.yml/dispatches'
  )
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main' })
})

test('falha com o status quando o GitHub recusa', async () => {
  const { impl } = fakeFetch(403, 'Resource not accessible')
  await assert.rejects(() => dispatchSync({ token: 'tok', fetchImpl: impl }), /403/)
})

test('falha sem token, sem chamar o GitHub', async () => {
  const { impl, calls } = fakeFetch(204)
  await assert.rejects(() => dispatchSync({ token: '', fetchImpl: impl }), /GITHUB_DISPATCH_TOKEN/)
  assert.equal(calls.length, 0)
})

test('handler devolve 401 sem o segredo do cron', async () => {
  const before = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'segredo'
  const res = fakeRes()
  await handler({ headers: { authorization: 'Bearer outro' } }, res)
  assert.equal(res.statusCode, 401)
  process.env.CRON_SECRET = before
})
