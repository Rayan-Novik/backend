import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const requireModuleActive = (nomeModulo) => {
    return async (req, res, next) => {
        try {
            // Assume que o middleware de autenticação (protect) já colocou o usuário no req
            const tenantId = req.user.id_tenant;

            // Busca a configuração do módulo para este tenant
            const configuracaoModulo = await prisma.controle_modulos.findUnique({
                where: {
                    modulo_id_tenant: {
                        modulo: nomeModulo,
                        id_tenant: tenantId
                    }
                }
            });

            // Se o registro existir e a flag 'ativo' for falsa, bloqueia o acesso
            if (configuracaoModulo && configuracaoModulo.ativo === false) {
                return res.status(503).json({
                    message: configuracaoModulo.mensagem_erro || `O módulo ${nomeModulo} está indisponível no momento devido à manutenção.`
                });
            }

            // Se não existir registro (padrão é ativo) ou estiver ativo, deixa passar
            return next();

        } catch (error) {
            console.error(`Erro ao verificar módulo ${nomeModulo}:`, error);
            return res.status(500).json({ message: "Erro interno ao verificar disponibilidade do módulo." });
        }
    };
};