const app = require('express')();

app.use(require('cors')());
app.use(require('express').json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'LLM Stock Arena API' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = app;
