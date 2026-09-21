import { server } from './app.js'; 
import { initCron } from './services/cronManager.js'; 
import 'dotenv/config';

const PORT = process.env.SERVER_PORT || 5000;

// ✅ Use server.listen (NÃO app.listen) para suportar Socket.io
server.listen(PORT, async () => {
  console.log(`\n🚀 Servidor e Socket rodando com sucesso na porta ${PORT}`);
  console.log(`🔗 Link local: http://127.0.0.1:${PORT}`);
  
  // 🔥 1. INICIA O AGENDADOR (CRON JOBS)
  initCron();
});