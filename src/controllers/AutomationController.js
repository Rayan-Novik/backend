import ConfiguracaoModel from '../models/configuracaoModel.js';
import { sendDynamicEmail } from '../services/emailService.js';

export const getAutomation = async (req, res) => {
    const { type } = req.params; 
    
    try {
        const key = `AUTOMATION_${type.toUpperCase()}`;
        const data = await ConfiguracaoModel.get(key, req.tenantId);
        
        const defaultConfig = {
            ativo: false,
            tempo_espera: 1, 
            assunto: '',
            corpo: ''
        };

        if (data) {
            res.json(JSON.parse(data));
        } else {
            res.json(defaultConfig);
        }

    } catch (error) {
        console.error("Erro ao buscar automação:", error);
        res.status(500).json({ error: 'Erro ao buscar configurações de automação.' });
    }
};

export const saveAutomation = async (req, res) => {
    const { type } = req.params;
    const { ativo, tempo_espera, assunto, corpo } = req.body;

    try {
        const key = `AUTOMATION_${type.toUpperCase()}`;
        
        const configObject = {
            ativo: ativo === true, 
            tempo_espera: Number(tempo_espera),
            assunto: assunto,
            corpo: corpo
        };

        const value = JSON.stringify(configObject);
        
        await ConfiguracaoModel.set(key, value, req.tenantId);
        
        res.json({ success: true, message: 'Automação salva com sucesso!' });

    } catch (error) {
        console.error("Erro ao salvar automação:", error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
};

export const testAutomation = async (req, res) => {
    const { type, assunto, corpo } = req.body;
    
    const user = { 
        nome_completo: 'Admin Teste', 
        email: req.user ? req.user.email : 'admin@seusite.com' 
    };
    
    const mockData = {
        items: [
            { nome: 'Produto Exemplo A', preco: 150.00, imagem_url: 'https://placehold.co/100x100?text=Prod+A' },
            { nome: 'Produto Exemplo B', preco: 90.00, imagem_url: 'https://placehold.co/100x100?text=Prod+B' }
        ],
        order: { 
            id_pedido: 12345, 
            preco_total: 240.00 
        },
        resetUrl: 'http://seusite.com/reset-password/TOKEN_EXEMPLO'
    };

    const tempConfig = { 
        ativo: true, 
        tempo_espera: 0, 
        assunto, 
        corpo 
    };

    try {
        console.log(`🧪 Testando automação ${type} para ${user.email} (Loja: ${req.tenantId})`);
        
        await sendDynamicEmail(type.toUpperCase(), user, mockData, tempConfig, req.tenantId);
        
        res.json({ success: true, message: `E-mail de teste enviado para ${user.email}!` });

    } catch (error) {
        console.error("Erro no teste de automação:", error);
        res.status(500).json({ error: error.message || 'Erro ao enviar e-mail de teste.' });
    }
};