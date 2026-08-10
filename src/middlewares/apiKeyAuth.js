import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    // Verifica se a chave é de teste (sk_test_...)
    const isSandbox = req.headers['x-sandbox'] === 'true' || (apiKey && apiKey.includes('_test_'));

    if (!apiKey) {
        return res.status(401).json({ error: 'Acesso negado: Chave de API não fornecida no header x-api-key.' });
    }

    try {
        const tokenData = await prisma.api_keys.findFirst({
            where: { chave: apiKey, ativo: true }
        });

        if (!tokenData) {
            return res.status(403).json({ error: 'Acesso negado: Chave de API inválida, revogada ou inativa.' });
        }

        // Injeta os IDs da loja na requisição
        req.tenant_id = tokenData.tenant_id || tokenData.id_tenant;
        req.tenantId = req.tenant_id; // Duplicado em camelCase para compatibilidade com os controllers

        let permissoesDaChave = [];
        if (tokenData.permissoes) {
            permissoesDaChave = typeof tokenData.permissoes === 'string' 
                ? JSON.parse(tokenData.permissoes) 
                : tokenData.permissoes;
        }
        
        req.api_permissoes = permissoesDaChave;
        req.is_sandbox = isSandbox; 

        // Só atualiza o "último uso" se não for teste
        if (!isSandbox) {
            prisma.api_keys.update({
                where: { id: tokenData.id },
                data: { ultimo_uso: new Date() }
            }).catch(err => console.error("Erro ao atualizar uso", err));
        }

        next();
    } catch (error) {
        console.error("Erro no middleware de API:", error);
        return res.status(500).json({ error: 'Erro interno ao validar chave.' });
    }
};

export const requirePermission = (permissaoNecessaria) => {
    return (req, res, next) => {
        const permissoesDaChave = req.api_permissoes || [];
        if (!permissoesDaChave.includes(permissaoNecessaria)) {
            return res.status(403).json({ 
                error: 'Acesso Negado.', 
                detalhe: `Sua chave não possui a permissão '${permissaoNecessaria}'.` 
            });
        }
        next(); 
    };
};