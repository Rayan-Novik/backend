export const requirePermission = (requiredPermission) => {
    return (req, res, next) => {
        // 1. Donos ou Admins Supremos têm acesso irrestrito
        if (req.user && (req.user.is_dono || req.user.isAdmin || req.user.role === 'ADMIN')) {
            return next();
        }

        const reqPerms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
        const reqPermsUpper = reqPerms.map(p => String(p).toUpperCase().trim());

        // Se checa DRIVER_APP_ACCESS e o usuário possui cargo ou role de entregador/motoboy
        if (reqPermsUpper.includes('DRIVER_APP_ACCESS') && req.user) {
            const cargoNome = String(req.user.cargoNome || req.user.cargos?.nome || '').toLowerCase().trim();
            const roleNome = String(req.user.role || '').toLowerCase().trim();
            const isDriver = cargoNome.includes('entregador') || cargoNome.includes('motoboy') || 
                            cargoNome.includes('motorista') || cargoNome.includes('delivery') ||
                            roleNome.includes('entregador') || roleNome.includes('motoboy') || 
                            roleNome.includes('motorista') || roleNome.includes('delivery');
            if (isDriver) {
                return next();
            }
        }

        // 2. Verifica se a permissão exigida está no array de permissões do funcionário
        let userPerms = req.user?.permissoes || [];
        if (typeof userPerms === 'string') {
            try { userPerms = JSON.parse(userPerms); } catch (_) { userPerms = []; }
        }
        if (!Array.isArray(userPerms)) userPerms = [];
        const userPermsUpper = userPerms.map(p => String(p).toUpperCase().trim());

        if (userPermsUpper.includes('ALL')) {
            return next();
        }

        const hasPermission = reqPermsUpper.some(p => userPermsUpper.includes(p));

        if (hasPermission) {
            return next();
        }

        // 3. Se chegou aqui, bloqueia o acesso
        const permNome = Array.isArray(requiredPermission) ? requiredPermission.join(' ou ') : requiredPermission;
        return res.status(403).json({ 
            message: `Acesso negado. Você não possui a permissão: ${permNome}`,
            erro_permissao: true,
            permissao_faltante: permNome,
            cargo: req.user?.cargoNome || req.user?.cargos?.nome || req.user?.role || 'Sem Cargo'
        });
    };
};