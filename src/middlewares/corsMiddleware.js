import cors from "cors";

// Para um ambiente SaaS em desenvolvimento/testes, é mais fácil
// permitir qualquer origem e focar a segurança na autenticação (Tokens JWT).
// Quando você for para a produção final real, pode voltar a restringir isso se quiser.
const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Permite qualquer origem. O 'true' diz ao CORS: "Pode deixar passar!"
    callback(null, true);
  },
  credentials: true,
  // 🚀 ADICIONADOS OS NOVOS HEADERS (x-tenant-domain, x-api-key, x-sandbox)
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-tenant-slug', 
    'x-tenant-id', 
    'x-tenant-domain', 
    'x-api-key', 
    'x-sandbox'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] 
});

export default corsMiddleware;