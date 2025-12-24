import jwt from 'jsonwebtoken';
import Usuario from '../models/usuarioModel.js';

export const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer')) {
    try {
      // Extrai o token do cabeçalho 'Bearer TOKEN'
      token = authHeader.split(' ')[1];

      // Verifica e decodifica o token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Adiciona o usuário (sem a senha) à requisição
      req.user = await Usuario.findById(decoded.id);

      next(); // Continua para a próxima função
    } catch (error) {
      res.status(401);
      next(new Error('Não autorizado, token falhou.'));
    }
  }

  if (!token) {
    res.status(401);
    next(new Error('Não autorizado, sem token.'));
  }
};