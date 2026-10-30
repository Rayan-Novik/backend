import axios from 'axios';

export const emitirNfce = async (req, res) => {
    try {
        const tenantIdStr = String(req.tenantId);

        // 🟢 Injetamos o tenant_id na raiz e em cada item para passar pela segurança do Módulo Fiscal
        const payload = {
            ...req.body,
            tenant_id: tenantIdStr,
            itens: req.body.itens ? req.body.itens.map(item => ({
                ...item,
                tenant_id: tenantIdStr
            })) : []
        };
        
        const response = await axios.post(`${process.env.API_FISCAL_URL}/nfce/emitir`, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("❌ Erro ao emitir NFC-e:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro crítico ao comunicar com a Sefaz na emissão da NFC-e.' });
    }
};