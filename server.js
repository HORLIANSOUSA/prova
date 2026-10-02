import express from 'express'   // importa a framework

const app = express()  
app.use(express.json())         // cria a aplicação
const PORT = 3000               // porta onde vamos escutar


app.get('/', (req, res) => {
  res.send('Hello, world!')     // envia resposta com status 200
})

function validateUserPayload(body) {
  const { nome, email } = body || {}
  if (!nome || typeof nomeAluno !== 'string') { return { ok: false, erro: 'nome é obrigatório' } }
 if (!nome || typeof nomelivro !== 'string') { return { ok: false, erro: 'nome do livro é obrigatório' } }
  return { ok: true, data: { nome, email } }
}

app.post('/emprestimos', async (req, res, next) => {
  try {
    const valid = validateemprestimoPayload(req.body)

    if (!valid.ok) return res.status(400).json({ erro: valid.erro })

    const novo = await createEmprestimo(valid.data.nome, valid.data.email)
    res.status(201).json(novo)
  } catch (err) { next(err) }
})

app.post('/emprestimos/batch', async (req, res) => {
  const newEmprestimos = req.body || []

  for (const emprestimo of newEmprestimos) {
    if (!emprestimo.nomeAluno || typeof emprestimo.nomeAluno !== 'string') { return res.status(400).json({ erro: 'nome do aluno é obrigatório' }) }
    if (!emprestimo.livro || typeof emprestimo.livro !== 'string') { return res.status(400).json({ erro: 'nome do livro é obrigatório' }) }
  }

  const novo = await createEmprestimos(newEmprestimos)
  res.status(201).json(novo)
})          
  


app.get('/emprestimos', async (req, res) => {
  res.json(await findAll())
})
app.put('/emprestimos/:id', async (req, res) => {
  const id = Number(req.params.id)
  const valid = validateEmprestimoPayload(req.body)
  if (!valid.ok) return res.status(400).json({ erro: valid.erro })

  const emprestimo = await updateEmprestimo(id, valid.data.nomeAluno, valid.data.livro)
  res.json(emprestimo)
})

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})