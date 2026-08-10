import jwt from 'jsonwebtoken';

const generateToken = (id, id_tenant, sessao_token = null) => {
  // 🟢 Agora o token também carrega o ID da Sessão Única
  return jwt.sign({ id, id_tenant, sessao_token }, process.env.JWT_SECRET, {
    expiresIn: '30d', 
  });
};

export default generateToken;