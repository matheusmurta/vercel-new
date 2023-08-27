const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const csvParser = require('csv-parser');
const { Readable } = require('stream'); // Importando a classe Readable
const secretKey = 'seu-segredo-aqui';

// Configurar o armazenamento para upload de arquivos CSV
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
app.use(express.json());

// middleware para parsear o corpo das requisições
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


const db = new sqlite3.Database('finance.db');

app.use(cors({
    origin: '*',
    methods: 'GET, OPTIONS, PATCH, DELETE, POST, PUT',
    allowedHeaders: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    credentials: true
  }));

// Função para criar as tabelas se elas não existirem
function createTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY,
            nome TEXT,
            password TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS regras (
            id INTEGER PRIMARY KEY,
            nome TEXT,
            identificador TEXT,
            id_usuario INTEGER,
            FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS extratos (
            id INTEGER PRIMARY KEY,
            data_lancamento TEXT,
            descricao TEXT,
            valor REAL,
            id_usuario INTEGER,
            id_relatorio INTEGER,
            FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
            FOREIGN KEY (id_relatorio) REFERENCES relatorios(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS relatorios (
            id INTEGER PRIMARY KEY,
            nome TEXT,
            id_usuario INTEGER,
            FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
        )
    `);
}

// Chamar a função para criar as tabelas quando a aplicação é iniciada
createTables();  

// Rota para registrar um usuário
app.post('/register-user', (req, res) => {
    const { nome, password } = req.body;
    // Lógica para registrar o usuário no banco de dados
    db.run('INSERT INTO usuarios (nome, password) VALUES (?, ?)', [nome, password], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao registrar usuário.' });
        } else {
            res.json({ message: 'Usuário registrado com sucesso.' });
        }
    });
});


// rota para gerar o token JWT
app.post('/login', (req, res) => {
    const { nome, password } = req.body;
    db.get('SELECT * FROM usuarios WHERE nome = ? AND password = ?', [nome, password], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao efetuar login.' });
        } else if (row) {
            // Gera o token JWT com o payload contendo o nome de usuário
            const token = jwt.sign({ nome: row.nome , id: row.id }, secretKey, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Credenciais inválidas.' });
        }
    });

  });
  
// middleware para verificar a autenticação
function authenticate(req, res, next) {
// Verifica se o token JWT foi passado no cabeçalho Authorization
const authHeader = req.headers['authorization'];
const token = authHeader && authHeader.split(' ')[1];
if (!token) return res.status(401).json({ error: 'Token não fornecido' });

// Verifica se o token JWT é válido
jwt.verify(token, secretKey, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });

    // Adiciona o payload decodificado do token à requisição para uso posterior
    req.user = decoded;
    next();
});
}


// Rota para cadastrar uma regra
app.post('/regra', authenticate, (req, res) => {
    const { nome, identificador } = req.body;
    // Lógica para cadastrar a regra no banco de dados

    const userId = req.user.id;

    db.run('INSERT INTO regras (nome, identificador, id_usuario) VALUES (?, ?, ?)', [nome, identificador,userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao cadastrar regra.' });
        } else {
            res.json({ message: 'Regra cadastrada com sucesso.' });
        }
    });
});


// Rota para atualizar uma regra
app.put('/regra/:regraId', authenticate, (req, res) => {
    const { nome, identificador } = req.body;
    const { regraId } = req.params;

    const userId = req.user.id;

    db.run('UPDATE regras SET nome = ?, identificador = ? WHERE id = ? AND id_usuario = ?', [nome, identificador, regraId, userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao atualizar regra.' });
        } else {
            res.json({ message: 'Regra atualizada com sucesso.' });
        }
    });
});


// Rota para excluir uma regra
app.delete('/regra/:identificador', authenticate, (req, res) => {
    const { identificador } = req.params;

    const userId = req.user.id;

    db.run('DELETE FROM regras WHERE identificador = ? AND id_usuario = ?', [identificador, userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao excluir regra.' });
        } else {
            res.json({ message: 'Regra excluída com sucesso.' });
        }
    });
});


// Rota para obter todas as regras do usuário atual
 app.get('/regras', authenticate, (req, res) => {
    const userId = req.user.id;

    db.all('SELECT * FROM regras WHERE id_usuario = ?', [userId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter regras.' });
        } else {
            res.json(rows);
        }
    });
}); 


// Rota para deletar uma regra
app.delete('/regra/:id', authenticate,  (req, res) => {
    const regraId = req.params.id;
    // Lógica para deletar a regra do banco de dados
    db.run('DELETE FROM regras WHERE id = ?', [regraId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao deletar regra.' });
        } else {
            res.json({ message: 'Regra deletada com sucesso.' });
        }
    });
});

app.post('/processar-csv', upload.single('csvFile'), authenticate,(req, res) => {
    const { idrelatorio } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado' });
    }

    const csvData = req.file.buffer.toString();
    const results = [];
    const stream = Readable.from(csvData);
    const userId = req.user.id; // Get the user ID using the same pattern


    stream
        .pipe(csvParser())
        .on('data', (data) => {
            const formattedData = formatCsvLine(data);
            if (formattedData) {
                results.push(formattedData);
            }
        })
        .on('end', () => {
            // Inserir os dados na tabela 'extratos'
            insertDataIntoTable(results, userId, idrelatorio );
            res.json(results);
        })
        .on('error', (error) => {
            res.status(500).json({ error: 'Erro ao processar o arquivo CSV' });
        });
});

function formatCsvLine(line) {
    const csvLine = line['data;descricao;valor'];

    if (!csvLine) {
        return null; // Linha vazia ou sem dados válidos
    }

    const parts = csvLine.split(';');
    if (parts.length !== 3) {
        return null; // Dados inválidos
    }

    const data = parts[0];
    const descricao = parts[1];
    const valorString = parts[2].replace(',', '.');
    const valor = parseFloat(valorString);

    if (!data || !descricao || isNaN(valor)) {
        return null; // Dados inválidos ou ausentes
    }

    return {
        data: data.trim(),
        descricao: descricao.trim(),
        valor: valor
    };
}


function insertDataIntoTable(data, id_usuario, id_relatorio) {
    const insertQuery = 'INSERT INTO extratos (data_lancamento, descricao, valor, id_usuario, id_relatorio) VALUES (?, ?, ?, ?, ?)';
    data.forEach(item => {
        const { data: data_lancamento, descricao, valor } = item;
        db.run(insertQuery, [data_lancamento, descricao, valor, id_usuario, id_relatorio]);
    });
}

app.get('/extratos/:idRelatorio', authenticate, (req, res) => {
    const userId = req.user.id;
    const idRelatorio = req.params.idRelatorio;

    db.all('SELECT * FROM extratos WHERE id_usuario = ? AND id_relatorio = ?', [userId, idRelatorio], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter lançamentos.' });
        } else {
            const informacoesFinanceiras = calcularInformacoesFinanceiras(rows);

            res.json({rows , informacoesFinanceiras});
        }
    });
});

function formatarValorEmReais(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcularInformacoesFinanceiras(lancamentos) {
    let totalReceitas = 0;
    let totalDespesas = 0;

    for (const lancamento of lancamentos) {
        if (lancamento.valor > 0) {
            totalReceitas += lancamento.valor;
        } else {
            totalDespesas += Math.abs(lancamento.valor);
        }
    }

    const saldoTotal = totalReceitas - totalDespesas;

    return {
        totalReceitas: formatarValorEmReais(totalReceitas),
        totalDespesas: formatarValorEmReais(totalDespesas),
        saldoTotal: formatarValorEmReais(saldoTotal)
    };
}

app.post('/relatorio', authenticate, (req, res) => {
    const { nome } = req.body;
    const userId = req.user.id;

    db.run('INSERT INTO relatorios (nome, id_usuario) VALUES (?, ?)', [nome, userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao cadastrar relatório.' });
        } else {
            res.json({ message: 'Relatório cadastrado com sucesso.' });
        }
    });
});


app.put('/relatorio/:id', authenticate, (req, res) => {
    const { nome } = req.body;
    const { id } = req.params;
    const userId = req.user.id;

    db.run('UPDATE relatorios SET nome = ? WHERE id = ? AND id_usuario = ?', [nome, id, userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao atualizar relatório.' });
        } else {
            res.json({ message: 'Relatório atualizado com sucesso.' });
        }
    });
});


app.delete('/relatorio/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    db.run('DELETE FROM relatorios WHERE id = ? AND id_usuario = ?', [id, userId], (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao excluir relatório.' });
        } else {
            res.json({ message: 'Relatório excluído com sucesso.' });
        }
    });
});



app.get('/relatorios', authenticate, (req, res) => {
    const userId = req.user.id;

    db.all('SELECT * FROM relatorios WHERE id_usuario = ?', [userId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter relatórios.' });
        } else {
            res.json(rows);
        }
    });
});


app.get('/gerar-relatorio', authenticate, (req, res) => {
    const userId = req.user.id;
    const { relatorioId } = req.query;

    const query = `
        SELECT r.nome AS 'nome relatorio',
               e.descricao,
               e.valor,
               CASE WHEN e.valor < 0 THEN 'despesa' ELSE 'receita' END AS 'tipo'
        FROM relatorios r
        JOIN extratos e ON r.id = e.id_relatorio
        JOIN regras rg ON rg.id_usuario = ? AND e.descricao LIKE '%' || rg.identificador || '%'
        WHERE r.id = ?
    `;

    db.all(query, [userId, relatorioId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao gerar o relatório.' });
        } else {
            res.json(rows);
        }
    });
});


app.get('/gerar-relatorio-identificador', authenticate, (req, res) => {
    const relatorioId = req.query.relatorioId;
    const userId = req.user.id;

    const query = `
        SELECT
            r.nome AS 'nome relatorio',
            e.descricao,
            CASE
                WHEN e.valor < 0 THEN -e.valor
                ELSE e.valor
            END AS valor,
            CASE
                WHEN e.valor < 0 THEN 'despesa'
                ELSE 'receita'
            END AS tipo
        FROM extratos e
        JOIN relatorios rl ON e.id_relatorio = rl.id
        JOIN regras r ON e.descricao LIKE '%' || r.identificador || '%'
        WHERE rl.id = ?
          AND e.id_usuario = ?
    `;

    db.all(query, [relatorioId, userId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao gerar relatório.' });
        } else {
            const relatorioComTotal = calcularTotalPorRelatorio(rows);

            res.json({rows, totais: relatorioComTotal});
        }
    });
});

function calcularTotalPorRelatorio(relatorio) {
    const totalPorRelatorio = relatorio.reduce((acc, item) => {
      const nomeRelatorio = item['nome relatorio'];
      const valor = item.valor;
      if (!acc[nomeRelatorio]) {
        acc[nomeRelatorio] = { nome: nomeRelatorio, total: 0 };
      }
      acc[nomeRelatorio].total += valor;
      return acc;
    }, {});
    return Object.values(totalPorRelatorio);
  }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

app.get('/api/data', (req, res) => {
    const data = {
        message: 'Dados vindos do servidor Node.js!'
    };
    res.json(data);
});