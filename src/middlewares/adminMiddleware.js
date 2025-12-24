// Este middleware é executado DEPOIS do 'protect'
const admin = (req, res, next) => {
    // O middleware 'protect' já adicionou o objeto 'req.user'
    if (req.user && req.user.isAdmin) {
        // Se o utilizador existe e é um admin, continua para a próxima função
        next();
    } else {
        // Se não for admin, envia um erro de 'Não Autorizado'
        res.status(401);
        throw new Error('Acesso negado. Não é um administrador.');
    }
};

// --- ADICIONE ESTAS NOVAS FUNÇÕES ABAIXO ---

// Permite acesso para Caixa OU super Admin (isAdmin)
const caixaOuAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'CAIXA' || req.user.isAdmin)) {
        next();
    } else {
        res.status(403).json({ message: 'Acesso restrito a Caixas ou Administradores.' });
    }
};

// Permite acesso para QUALQUER função do PDV (Atendente, Caixa ou Admin)
const acessoPDV = (req, res, next) => {
    if (req.user && (req.user.role === 'ATENDENTE' || req.user.role === 'CAIXA' || req.user.isAdmin)) {
        next();
    } else {
        res.status(403).json({ message: 'Acesso restrito à equipe do PDV.' });
    }
};

// --- EXPORTE AS NOVAS FUNÇÕES ---
export { admin, caixaOuAdmin, acessoPDV };