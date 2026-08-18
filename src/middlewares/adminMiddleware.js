export const admin = (req, res, next) => {
    // 👑 O TENANT (DONO) NÃO TEM LIMITAÇÃO: Passa direto
    if (req.user && (req.user.is_dono || req.user.role === 'ADMIN' || req.user.isAdmin)) {
        return next();
    }
    
    // 🚫 Se não for dono nem admin, devolve o erro limpo em JSON (não "crasha" o app)
    return res.status(403).json({ message: 'Acesso negado. Apenas Administradores.' });
};

// --- 2. CAIXA OU ADMIN ---
export const caixaOuAdmin = (req, res, next) => {
    // 👑 O TENANT (DONO) NÃO TEM LIMITAÇÃO: Passa direto
    if (req.user && (req.user.is_dono || req.user.role === 'CAIXA' || req.user.role === 'ADMIN' || req.user.isAdmin)) {
        return next();
    }
    
    return res.status(403).json({ message: 'Acesso restrito a Caixas ou Administradores.' });
};

// --- 3. EQUIPE DO PDV (Qualquer um do PDV ou Admin) ---
export const acessoPDV = (req, res, next) => {
    // 👑 O TENANT (DONO) NÃO TEM LIMITAÇÃO: Passa direto
    if (req.user && (req.user.is_dono || req.user.role === 'ATENDENTE' || req.user.role === 'CAIXA' || req.user.role === 'ADMIN' || req.user.isAdmin)) {
        return next();
    }
    
    return res.status(403).json({ message: 'Acesso restrito à equipe do PDV.' });
};


// ============================================================================
// 🟢 4. VERIFICADOR DE PERMISSÕES GRANULARES DA EQUIPE
// ============================================================================
export const requirePermission = (requiredPermission) => {
    return (req, res, next) => {
        // 👑 O TENANT (DONO) NÃO TEM LIMITAÇÃO: Passa direto em qualquer permissão!
        if (req.user && (req.user.is_dono || req.user.isAdmin || req.user.role === 'ADMIN')) {
            return next();
        }

        // 👷 FUNCIONÁRIOS: Verifica se a permissão exigida está no array do banco de dados
        const hasPermission = req.user && req.user.permissoes && req.user.permissoes.includes(requiredPermission);

        if (hasPermission) {
            return next();
        }

        // 🚫 Se for funcionário comum e não tiver a chave, a porta não abre
        return res.status(403).json({ 
            message: `Acesso negado. Você não possui a permissão: ${requiredPermission}` 
        });
    };
};