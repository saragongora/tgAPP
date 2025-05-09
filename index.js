const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./models/db');

const app = express();

// Configurações do Express
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Configuração de sessão
app.use(session({
  secret: 'chave-super-secreta',
  resave: false,
  saveUninitialized: false
}));

// Configurações do EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Rotas ---

// Página inicial → redireciona pro login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Tela de login
app.get('/login', (req, res) => {
  res.render('login_adm', { erro: null });
});

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  const USUARIO_PADRAO = 'admin';
  const SENHA_PADRAO = '123456';

  if (usuario === USUARIO_PADRAO && senha === SENHA_PADRAO) {
    req.session.logado = true;
    res.redirect('/painel');
  } else {
    res.render('login_adm', { erro: 'Usuário ou senha incorretos!' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Painel administrativo
app.get('/painel', (req, res) => {
  if (req.session.logado) {
    res.render('pagina_adm', { resultados: [], buscaRealizada: false });
  } else {
    res.redirect('/login');
  }
});


// Tela de adicionar novo registro
app.get('/add-registro', (req, res) => {
  if (req.session.logado) {
    res.render('add_registro');
  } else {
    res.redirect('/login');
  }
});

// Salvar novo registro
app.post('/add-registro', upload.single('arquivo'), (req, res) => {
  if (!req.session.logado) return res.redirect('/login');

  const {
    nome_trabalho,
    tipo_trabalho,
    ano_conclusao,
    semestre,
    curso,
    alunos = [],
    orientadores = []
  } = req.body;

  const alunosArray = Array.isArray(alunos) ? alunos : [alunos];
  const orientadoresArray = Array.isArray(orientadores) ? orientadores : [orientadores];
  const arquivo = req.file.buffer;

  const sqlTg = `INSERT INTO tg (tipo, nome_tg, curso, ano, semestre, arquivo) VALUES (?, ?, ?, ?, ?, ?)`;
  const tgValues = [tipo_trabalho, nome_trabalho, curso, ano_conclusao, semestre, arquivo];

  db.query(sqlTg, tgValues, (err, result) => {
    if (err) return res.send('Erro ao inserir trabalho: ' + err);

    const idTg = result.insertId;

    alunosArray.forEach(nome => {
      if (!nome.trim()) return;
      db.query(`INSERT INTO aluno (nome_aluno) VALUES (?)`, [nome], (err, result) => {
        if (err) return console.log('Erro ao inserir aluno:', err);
        const idAluno = result.insertId;
        db.query(`INSERT INTO aluno_tg (id_aluno, id_tg) VALUES (?, ?)`, [idAluno, idTg]);
      });
    });

    orientadoresArray.forEach(nome => {
      if (!nome.trim()) return;
      const idOrientador = uuidv4();
      db.query(`INSERT INTO orientador (id_orientador, nome_orientador) VALUES (?, ?)`, [idOrientador, nome], (err) => {
        if (err) return console.log('Erro ao inserir orientador:', err);
        db.query(`INSERT INTO orientador_tg (id_orientador, id_tg) VALUES (?, ?)`, [idOrientador, idTg]);
      });
    });

    res.redirect('/painel');
  });
});

// Buscar registros
app.get('/buscar', (req, res) => {
  const termo = req.query.termo;

  if (!termo) {
    return res.render('pagina_adm', { resultados: [], buscaRealizada: false });
  }

  const query = `
    SELECT tg.*, 
      GROUP_CONCAT(DISTINCT aluno.nome_aluno) AS alunos,
      GROUP_CONCAT(DISTINCT orientador.nome_orientador) AS orientadores
    FROM tg
    LEFT JOIN aluno_tg ON tg.id_tg = aluno_tg.id_tg
    LEFT JOIN aluno ON aluno.id_aluno = aluno_tg.id_aluno
    LEFT JOIN orientador_tg ON tg.id_tg = orientador_tg.id_tg
    LEFT JOIN orientador ON orientador.id_orientador = orientador_tg.id_orientador
    WHERE 
      tg.nome_tg LIKE ? OR 
      aluno.nome_aluno LIKE ? OR 
      orientador.nome_orientador LIKE ?
    GROUP BY tg.id_tg
  `;

  const likeTerm = `%${termo}%`;

  db.query(query, [likeTerm, likeTerm, likeTerm], (err, results) => {
    if (err) {
      console.error('Erro ao buscar registros:', err);
      return res.send('Erro na busca');
    }

    const registros = results.map(r => ({
      ...r,
      alunos: r.alunos ? r.alunos.split(',') : [],
      orientadores: r.orientadores ? r.orientadores.split(',') : []
    }));

    res.render('pagina_adm', { resultados: registros, buscaRealizada: true });
  });
});


// Rota GET para carregar formulário de edição
app.get('/editar/:id', (req, res) => {
  const idTg = req.params.id;

  const query = `
    SELECT tg.*, 
      GROUP_CONCAT(DISTINCT aluno.nome_aluno) AS alunos,
      GROUP_CONCAT(DISTINCT orientador.nome_orientador) AS orientadores
    FROM tg
    LEFT JOIN aluno_tg ON tg.id_tg = aluno_tg.id_tg
    LEFT JOIN aluno ON aluno.id_aluno = aluno_tg.id_aluno
    LEFT JOIN orientador_tg ON tg.id_tg = orientador_tg.id_tg
    LEFT JOIN orientador ON orientador.id_orientador = orientador_tg.id_orientador
    WHERE tg.id_tg = ?
    GROUP BY tg.id_tg
  `;

  db.query(query, [idTg], (err, results) => {
    if (err) return res.send('Erro ao carregar dados para edição: ' + err);
    if (results.length === 0) return res.send('Registro não encontrado');

    const registro = results[0];
    registro.alunos = registro.alunos ? registro.alunos.split(',') : [];
    registro.orientadores = registro.orientadores ? registro.orientadores.split(',') : [];

    res.render('editar_registro', { registro });
  });
});

// POST para salvar edição
app.post('/editar/:id', upload.single('arquivo'), (req, res) => {
  const idTg = req.params.id;
  const {
    nome_trabalho,
    tipo_trabalho,
    ano_conclusao,
    semestre,
    curso,
    alunos = [],
    orientadores = []
  } = req.body;

  const alunosArray = Array.isArray(alunos) ? alunos : [alunos];
  const orientadoresArray = Array.isArray(orientadores) ? orientadores : [orientadores];
  const arquivo = req.file ? req.file.buffer : null;

  const updateSql = `
    UPDATE tg SET tipo = ?, nome_tg = ?, curso = ?, ano = ?, semestre = ?
    ${arquivo ? ', arquivo = ?' : ''}
    WHERE id_tg = ?
  `;
  const updateValues = arquivo
    ? [tipo_trabalho, nome_trabalho, curso, ano_conclusao, semestre, arquivo, idTg]
    : [tipo_trabalho, nome_trabalho, curso, ano_conclusao, semestre, idTg];

  db.query(updateSql, updateValues, (err) => {
    if (err) return res.send('Erro ao atualizar trabalho: ' + err);

    // Atualizar alunos e orientadores
    db.query(`DELETE FROM aluno_tg WHERE id_tg = ?`, [idTg]);
    db.query(`DELETE FROM orientador_tg WHERE id_tg = ?`, [idTg]);

    alunosArray.forEach(nome => {
      if (!nome.trim()) return;
    
      db.query(`SELECT id_aluno FROM aluno WHERE nome_aluno = ?`, [nome], (err, results) => {
        if (err) return console.log('Erro ao buscar aluno:', err);
    
        if (results.length > 0) {
          // Já existe
          const idAluno = results[0].id_aluno;
          db.query(`INSERT INTO aluno_tg (id_aluno, id_tg) VALUES (?, ?)`, [idAluno, idTg]);
        } else {
          // Não existe → cria
          db.query(`INSERT INTO aluno (nome_aluno) VALUES (?)`, [nome], (err, result) => {
            if (err) return console.log('Erro ao inserir aluno:', err);
            const idAluno = result.insertId;
            db.query(`INSERT INTO aluno_tg (id_aluno, id_tg) VALUES (?, ?)`, [idAluno, idTg]);
          });
        }
      });
    });
    
    orientadoresArray.forEach(nome => {
      if (!nome.trim()) return;
    
      db.query(`SELECT id_orientador FROM orientador WHERE nome_orientador = ?`, [nome], (err, results) => {
        if (err) return console.log('Erro ao buscar orientador:', err);
    
        if (results.length > 0) {
          // Já existe
          const idOrientador = results[0].id_orientador;
          db.query(`INSERT INTO orientador_tg (id_orientador, id_tg) VALUES (?, ?)`, [idOrientador, idTg]);
        } else {
          // Não existe → cria
          const idOrientador = uuidv4();
          db.query(`INSERT INTO orientador (id_orientador, nome_orientador) VALUES (?, ?)`, [idOrientador, nome], (err) => {
            if (err) return console.log('Erro ao inserir orientador:', err);
            db.query(`INSERT INTO orientador_tg (id_orientador, id_tg) VALUES (?, ?)`, [idOrientador, idTg]);
          });
        }
      });
    });
    

    res.redirect('/painel');
  });
});



// Excluir registro
app.post('/excluir/:id', (req, res) => {
  const idTg = req.params.id;

  db.query(`DELETE FROM aluno_tg WHERE id_tg = ?`, [idTg]);
  db.query(`DELETE FROM orientador_tg WHERE id_tg = ?`, [idTg]);
  db.query(`DELETE FROM tg WHERE id_tg = ?`, [idTg], (err) => {
    if (err) return res.send('Erro ao excluir trabalho: ' + err);
    res.redirect('/painel');
  });
});

// Iniciar servidor
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
