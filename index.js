const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');

// Configuração do middleware CORS
app.use(cors({
    origin: '*',
    methods: 'GET, OPTIONS, PATCH, DELETE, POST, PUT',
    allowedHeaders: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    credentials: true
  }));
  
app.get('/api/data', (req, res) => {
    const data = {
        message: 'Dados vindos do servidor Node.js!'
    };
    res.json(data);
});

app.get('/', (req, res) => {
    res.send('Olá, mundo! Este é o endpoint GET simples YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY.');
  });

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});


app.post('/api/postData', (req, res) => {
    const receivedData = req.body;
    console.log('Dados recebidos:', receivedData);
    
    res.json({
        message: 'Dados recebidos com sucesso!', data:receivedData
    });
});
