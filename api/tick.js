// Gatilho do sync chamado pelo cron da Vercel a cada 5 minutos.
//
// Por que existe: o `schedule` do GitHub Actions e "melhor esforco". Em nov/2026 o
// cron de 5 min rodava so 3 a 5 vezes por dia (uma a cada ~6 h), e vaga nova levava
// horas pra aparecer no site. `workflow_dispatch` nao sofre esse atraso, entao a
// Vercel (cron pontual) so dispara o mesmo workflow; o sync continua no Actions.
import { timingSafeEqual } from 'node:crypto'

const REPO = 'Mandl-Creative/nirvana-careers-sync'
const WORKFLOW = 'sync.yml'

export function isAuthorized(header, secret) {
  if (!secret || typeof header !== 'string') return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function dispatchSync({ token, fetchImpl = fetch } = {}) {
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN nao definido no ambiente.')

  const response = await fetchImpl(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'nirvana-careers-sync',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (response.status !== 204) {
    // A mensagem nunca inclui o token; so status e corpo da resposta.
    const text = await response.text().catch(() => '')
    throw new Error(`GitHub respondeu ${response.status} ao disparar o sync: ${text}`)
  }
}

export default async function handler(req, res) {
  if (!isAuthorized(req.headers?.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ ok: false })
  }

  try {
    await dispatchSync({ token: process.env.GITHUB_DISPATCH_TOKEN })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error(error.message)
    return res.status(502).json({ ok: false, error: error.message })
  }
}
