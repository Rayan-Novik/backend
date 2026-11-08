export const requirePermission = (requiredPermission) => {
    return (req, res, next) => {
        // 1. Donos ou Admins Supremos têm acesso irrestrito
        if (req.user && (req.user.is_dono || req.user.isAdmin || req.user.role === 'ADMIN')) {
            return next();
        }

        // 2. Verifica se a permissão exigida está no array de permissões do funcionário
        const userPerms = req.user?.permissoes || [];
        const hasPermission = Array.isArray(requiredPermission)
            ? requiredPermission.some(p => userPerms.includes(p))
            : userPerms.includes(requiredPermission);

        if (hasPermission) {
            return next();
        }

        // 3. Se chegou aqui, bloqueia o acesso
        const permNome = Array.isArray(requiredPermission) ? requiredPermission.join(' ou ') : requiredPermission;
        return res.status(403).json({ 
            message: `Acesso negado. Você não possui a permissão: ${permNome}` 
        });
    };
};