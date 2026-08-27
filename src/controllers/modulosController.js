import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// GET: Retorna todos os módulos configurados para a loja (tenant) atual
export const getModulos = async (req, res) => {
    try {
        const tenantId = req.user.id_tenant;
        
        const modulos = await prisma.controle_modulos.findMany({
            where: { id_tenant: tenantId }
        });
        
        res.json(modulos);
    } catch (error) {
        console.error('Erro ao buscar módulos:', error);
        res.status(500).json({ message: 'Erro ao buscar status dos módulos.' });
    }
};

// PUT: Atualiza/Cria as configurações enviadas pelo frontend
export const updateModulos = async (req, res) => {
    try {
        const tenantId = req.user.id_tenant;
        const { modulos } = req.body; 

        if (!modulos || !Array.isArray(modulos)) {
            return res.status(400).json({ message: 'Formato de dados inválido.' });
        }

        // Usamos uma transação (transaction) para garantir que todas as atualizações 
        // rodem juntas com segurança, fazendo um "Upsert" (Cria se não existir, atualiza se existir)
        const operacoesDb = modulos.map(mod => {
            return prisma.controle_modulos.upsert({
                where: {
                    modulo_id_tenant: {
                        modulo: mod.modulo,
                        id_tenant: tenantId
                    }
                },
                update: {
                    ativo: mod.ativo,
                    mensagem_erro: mod.mensagem_erro || null
                },
                create: {
                    id_tenant: tenantId,
                    modulo: mod.modulo,
                    ativo: mod.ativo,
                    mensagem_erro: mod.mensagem_erro || null
                }
            });
        });

        await prisma.$transaction(operacoesDb);

        res.json({ message: 'Módulos atualizados com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar módulos:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar os módulos.' });
    }
};