import { server } from './app.js'; 
import { initCron } from './services/cronManager.js'; // <--- IMPORTANTE

const PORT = process.env.SERVER_PORT || 5000;

// ✅ Use server.listen (NÃO app.listen)
server.listen(PORT, () => {
  console.log(`🚀 Servidor e Socket rodando com sucesso na porta ${PORT}`);
  
  // 🔥 INICIA O AGENDADOR ASSIM QUE O SERVIDOR SOBE
  initCron();
});