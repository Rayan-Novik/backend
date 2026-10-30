import axios from 'axios';

export const emitirNfe = async (req, res) => {
    try {
        const tenantIdStr = String(req.tenantId);

        // 🟢 A MÁGICA AQUI: Injetamos o tenant_id na raiz DA NOTA e dentro de CADA ITEM!
        const payload = {
            ...req.body,
            tenant_id: tenantIdStr,
            itens: req.body.itens ? req.body.itens.map(item => ({
                ...item,
                tenant_id: tenantIdStr // 👈 Carimba o tenant no item para não dar erro no Prisma do Módulo Fiscal
            })) : []
        };
        
        const response = await axios.post(`${process.env.API_FISCAL_URL}/nfe/emitir`, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("❌ Erro ao emitir NF-e:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro crítico ao comunicar com a Sefaz.' });
    }
};