import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 🟢 BUSCA AS CONFIGURAÇÕES DA LOJA
export const getWhazingConfig = async (req, res) => {
    try {
        const config = await prisma.whazing_configuracoes.findUnique({
            where: { id_tenant: Number(req.tenantId) }
        });
        
        // Retorna a configuração ou um objeto vazio se a loja ainda não configurou
        res.json(config || {});
    } catch (error) {
        console.error("Erro ao buscar config do Whazing:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};

// 🟢 SALVA OU ATUALIZA TUDO DE UMA SÓ VEZ (UPSERT)
export const updateWhazingConfig = async (req, res) => {
    try {
        const data = req.body;
        const id_tenant = Number(req.tenantId);

        const config = await prisma.whazing_configuracoes.upsert({
            where: { id_tenant: id_tenant },
            update: {
                base_url: data.base_url,
                api_id: data.api_id,
                token: data.token,
                whazing_tenant_id: data.whazing_tenant_id,
                board_pedidos_id: data.board_pedidos_id,
                col_pendente_id: data.col_pendente_id,
                col_pago_id: data.col_pago_id,
                col_recusado_id: data.col_recusado_id
            },
            create: {
                id_tenant: id_tenant,
                base_url: data.base_url,
                api_id: data.api_id,
                token: data.token,
                whazing_tenant_id: data.whazing_tenant_id,
                board_pedidos_id: data.board_pedidos_id,
                col_pendente_id: data.col_pendente_id,
                col_pago_id: data.col_pago_id,
                col_recusado_id: data.col_recusado_id
            }
        });

        res.json({ message: "Configurações do Whazing salvas com sucesso!", config });
    } catch (error) {
        console.error("Erro ao salvar config do Whazing:", error);
        res.status(500).json({ error: "Erro interno ao salvar." });
    }
};