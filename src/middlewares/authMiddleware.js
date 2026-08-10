import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const tenantIdDoToken = Number(decoded.id_tenant);
            const sessaoTokenDoToken = decoded.sessao_token; // 🟢 Lendo a sessão do Token

            if (!tenantIdDoToken) {
                 return res.status(401).json({ message: 'Identificador da loja ausente no token.' });
            }

            if (req.tenantId && req.tenantId !== tenantIdDoToken) {
                return res.status(403).json({ 
                    message: 'Conflito de Sessão! Você está logado com os dados de outra loja.' 
                });
            }

            req.tenantId = tenantIdDoToken; 

            // ==============================================================
            // 👑 MÁGICA DO DONO
            // ==============================================================
            if (decoded.id_usuario === 'DONO' || decoded.id === 'DONO') {
                const loja = await prisma.tenants.findUnique({
                    where: { id: req.tenantId }
                });

                if (!loja) return res.status(401).json({ message: 'Loja não encontrada para este dono.' });

                // 🛑 TRAVA DE SESSÃO ÚNICA (DONO)
                if (loja.sessao_token && sessaoTokenDoToken && loja.sessao_token !== sessaoTokenDoToken) {
                    return res.status(401).json({ forceLogout: true, message: 'Sua conta foi acessada em outro dispositivo.' });
                }

                req.user = {
                    id_usuario: 'DONO', 
                    is_dono: true, 
                    id_tenant: req.tenantId,
                    nome_completo: loja.nome_fantasia || 'Proprietário',
                    email: loja.email,
                    isAdmin: true,
                    role: 'ADMIN'
                };

                return next(); 
            }

            const userId = Number(decoded.id_usuario || decoded.id);

            // ==============================================================
            // 💼 EQUIPE (FUNCIONÁRIOS)
            // ==============================================================
            const staff = await prisma.funcionarios.findFirst({
                where: { id_funcionario: userId, id_tenant: req.tenantId, ativo: true },
                include: { cargos: true }
            });

            if (staff) {
                // 🛑 TRAVA DE SESSÃO ÚNICA (FUNCIONÁRIO)
                if (staff.sessao_token && sessaoTokenDoToken && staff.sessao_token !== sessaoTokenDoToken) {
                    return res.status(401).json({ forceLogout: true, message: 'Sua conta foi acessada em outro dispositivo.' });
                }

                const permissoes = staff.cargos ? staff.cargos.permissoes : [];

                req.user = {
                    id_usuario: staff.id_funcionario, 
                    id_tenant: staff.id_tenant,
                    nome_completo: staff.nome_completo,
                    email: staff.email,
                    isAdmin: staff.isAdmin,
                    role: staff.role,
                    id_cargo: staff.id_cargo,
                    permissoes: permissoes 
                };
                return next();
            }

            // ==============================================================
            // 🛍️ CLIENTES (Não tem trava de sessão única! Livres para logar onde quiser)
            // ==============================================================
            const cliente = await prisma.usuarios.findFirst({
                where: { id_usuario: userId, id_tenant: req.tenantId }, 
                select: { id_usuario: true, id_tenant: true, nome_completo: true, email: true }
            });

            if (cliente) {
                req.user = {
                    id_usuario: cliente.id_usuario,
                    id_tenant: cliente.id_tenant,
                    nome_completo: cliente.nome_completo,
                    email: cliente.email,
                    isAdmin: false, 
                    role: 'CLIENTE' 
                };
                return next();
            }

            return res.status(403).json({ message: 'Acesso negado: Usuário não encontrado nesta loja.' });

        } catch (error) {
            console.error("Erro no token auth:", error.message);
            res.status(401).json({ message: 'Sessão expirada ou token inválido.' });
        }
    } else {
        res.status(401).json({ message: 'Não autorizado, nenhum token fornecido.' });
    }
};

// --- 2. Middleware de Admin (Flexível para não quebrar rotas antigas) ---
export const admin = (req, res, next) => {
    if (req.user && (req.user.isAdmin || req.user.role === 'ADMIN' || req.user.is_dono)) {
        next();
    } else {
        res.status(403).json({ message: 'Acesso negado. Apenas Administradores.' });
    }
};

// --- 3. Middleware para Caixa ou Admin ---
export const caixaOrAdmin = (req, res, next) => {
    if (req.user && (req.user.isAdmin || req.user.role === 'ADMIN' || req.user.role === 'CAIXA' || req.user.is_dono)) {
        next();
    } else {
        res.status(403).json({ message: 'Acesso restrito a Caixas ou Administradores.' });
    }
};

// --- 4. Middleware para Equipe PDV ---
export const acessoPDV = (req, res, next) => {
    const cargosPermitidos = ['ADMIN', 'CAIXA', 'ATENDENTE', 'GERENTE'];
    
    if (req.user && (req.user.isAdmin || req.user.is_dono || cargosPermitidos.includes(req.user.role))) {
        next();
    } else {
        res.status(403).json({ message: 'Acesso restrito à equipe do PDV.' });
    }
};