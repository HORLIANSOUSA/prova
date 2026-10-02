import express from 'express'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = 3000
const __dirname = dirname(fileURLToPath(import.meta.url))
const dataPath = join(__dirname, 'src', 'data.json')

// le e devolve o array de usuarios; se arquivo nao existir, devolve []
async function lerEmprestimos() {
  try {
    const conteudo = await readFile(dataPath, 'utf8')
    return JSON.parse(conteudo)
  } catch (err) {
    if (err.code === 'ENOENT') return [] // arquivo nao existe ainda
    throw err // outro erro: propaga
  }
}

// escreve o array atualizado de volta no arquivo
async function salvarEmprestimos(emprestimos) {
  await writeFile(dataPath, `${JSON.stringify(emprestimos, null, 2)}\n`)
}

function erroHttp(status, mensagem) {
  const err = new Error(mensagem)
  err.status = status
  return err
}

function validarCampo(body, campo, mensagem) {
  if (typeof body?.[campo] !== 'string' || !body[campo].trim()) {
    throw erroHttp(400, mensagem)
  }
}

function validarEmprestimoPayload(body) {
  const { nomeAluno, livro } = body || {}
  if (typeof nomeAluno !== 'string' || !nomeAluno.trim()) {
    return { ok: false, erro: 'O campo nomeAluno é obrigatório' }
  }
  if (typeof livro !== 'string' || !livro.trim()) {
    return { ok: false, erro: 'O campo livro é obrigatório' }
  }
  return { ok: true, data: { nomeAluno, livro } }
}

function proximoId(emprestimos) {
  return emprestimos.length
    ? Math.max(...emprestimos.map((emprestimo) => emprestimo.id)) + 1
    : 1
}

function buscarPorId(emprestimos, id) {
  const emprestimo = emprestimos.find((item) => item.id === id)
  if (!emprestimo) throw erroHttp(404, 'Empréstimo não encontrado')
  return emprestimo
}

function exigeBody(req, res, next) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ erro: 'body obrigatório' })
  }
  // next() passa a vez para o proximo middleware ou handler.
  next()
}

// habilita req.body como JSON
app.use(express.json())

// 'finish' dispara quando a resposta ja foi enviada ao cliente
app.use((req, res, next) => {
  const inicio = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} — ${Date.now() - inicio}ms`)
  })
  next()
})

// Rota GET na raiz "/" responde com texto
app.get('/', (req, res) => {
  res.send('Hello, world!') // envia resposta com status 200
})

app.get('/json', (req, res) => {
  res.json({ mensagem: 'Olá em JSON', timestamp: Date.now() })
})

app.get('/saudar/:nome', (req, res) => {
  res.send(`Olá, ${req.params.nome}!`)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/soma/:a/:b', (req, res) => {
  const soma = Number(req.params.a) + Number(req.params.b)
  res.json({ soma })
})

app.get('/echo', (req, res) => {
  res.json(req.query)
})

app.get('/emprestimos', async (req, res, next) => {
  try {
    const emprestimos = await lerEmprestimos()
    // devolve apenas emprestimos ativos (soft delete)
    res.json(emprestimos.filter((item) => item.devolvidoEm === null))
  } catch (err) {
    next(err)
  }
})

app.get('/emprestimos/:id', async (req, res, next) => {
  try {
    // params vem SEMPRE como string; convertemos para number antes da busca
    const id = Number(req.params.id)
    const emprestimo = buscarPorId(await lerEmprestimos(), id)
    if (emprestimo.devolvidoEm !== null) {
      throw erroHttp(404, 'Empréstimo não encontrado')
    }
    res.json(emprestimo)
  } catch (err) {
    next(err)
  }
})

app.post('/emprestimos', exigeBody, async (req, res, next) => {
  try {
    const validacao = validarEmprestimoPayload(req.body)
    // validacao simples
    if (!validacao.ok) return res.status(400).json({ erro: validacao.erro })

    const emprestimos = await lerEmprestimos()
    const livroJaEmprestado = emprestimos.some((item) =>
      item.devolvidoEm === null &&
      item.livro.trim().toLowerCase() === validacao.data.livro.trim().toLowerCase()
    )
    if (livroJaEmprestado) {
      throw erroHttp(409, 'Este livro já está emprestado')
    }

    const novo = {
      id: proximoId(emprestimos),
      ...validacao.data,
      devolvidoEm: null,
    }

    emprestimos.push(novo)
    await salvarEmprestimos(emprestimos)
    res.status(201).json(novo) // 201 Created + recurso no body
  } catch (err) {
    next(err)
  }
})

app.put('/emprestimos/:id', exigeBody, async (req, res, next) => {
  try {
    const validacao = validarEmprestimoPayload(req.body)
    if (!validacao.ok) return res.status(400).json({ erro: validacao.erro })

    // 1. params vem SEMPRE como string; converter para number
    const id = Number(req.params.id)
    const emprestimos = await lerEmprestimos()
    // 2. Busca o indice (nao o objeto) para poder substituir no array
    const indice = emprestimos.findIndex((item) => item.id === id)
    if (indice === -1) throw erroHttp(404, 'Empréstimo não encontrado')

    // 3. SUBSTITUI o objeto inteiro; mantem id da URL e descarta o do body
    const emprestimo = {
      id,
      ...validacao.data,
      devolvidoEm: emprestimos[indice].devolvidoEm,
    }
    emprestimos[indice] = emprestimo

    // 5. Persiste e responde com recurso atualizado
    await salvarEmprestimos(emprestimos)
    res.json(emprestimo)
  } catch (err) {
    next(err)
  }
})

app.patch('/emprestimos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const emprestimos = await lerEmprestimos()
    const emprestimo = buscarPorId(emprestimos, id)

    // PERIGO: Object.assign(user, req.body) permitiria sobrescrever o id!
    // Se req.body vier { id: 999, livro: "x" } -> user.id vira 999!
    // CORRETO: filtrar campos sensiveis ANTES do merge
    const { id: _id, devolvidoEm: _devolvidoEm, ...dados } = req.body || {}
    const dadosPermitidos = {}

    if (dados.nomeAluno !== undefined) {
      validarCampo(dados, 'nomeAluno', 'O campo nomeAluno não pode ficar vazio')
      dadosPermitidos.nomeAluno = dados.nomeAluno
    }
    if (dados.livro !== undefined) {
      validarCampo(dados, 'livro', 'O campo livro não pode ficar vazio')
      dadosPermitidos.livro = dados.livro
    }

    Object.assign(emprestimo, dadosPermitidos)
    await salvarEmprestimos(emprestimos)
    res.json(emprestimo)
  } catch (err) {
    next(err)
  }
})

app.patch('/emprestimos/:id/restore', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const emprestimos = await lerEmprestimos()
    const emprestimo = buscarPorId(emprestimos, id)

    // Restaurar: limpa a data de devolucao.
    emprestimo.devolvidoEm = null
    await salvarEmprestimos(emprestimos)
    res.json(emprestimo)
  } catch (err) {
    next(err)
  }
})

app.delete('/emprestimos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const emprestimos = await lerEmprestimos()
    const emprestimo = buscarPorId(emprestimos, id)
    if (emprestimo.devolvidoEm !== null) {
      throw erroHttp(409, 'Este empréstimo já foi devolvido')
    }

    emprestimo.devolvidoEm = new Date().toISOString() // marca devolucao
    await salvarEmprestimos(emprestimos)
    res.status(204).end() // 204 = sem conteudo
  } catch (err) {
    next(err)
  }
})

app.get('/provocar-erro', (req, res, next) => {
  try {
    throw new Error('algo explodiu de propósito')
  } catch (err) {
    next(err)
  }
})

app.use((req, res) => {
  // depois das rotas, responde quando nenhuma URL corresponder
  res.status(404).json({ erro: `rota ${req.method} ${req.url} não existe` })
})

// deve ser o ULTIMO app.use do arquivo; quatro parametros identificam o handler de erro
app.use((err, req, res, next) => {
  console.error(err.stack)
  const status = err.status ?? 500
  res.status(status).json({ erro: err.message || 'Erro interno' })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})