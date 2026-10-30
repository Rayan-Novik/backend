import axios from 'axios';

const getApiFiscalUrl = () => process.env.API_FISCAL_URL;
const getApiFiscalAuthHeaders = () => ({
    headers: {
        'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

// GET: Busca os dados da tabela solicitada
export const listarTabelaFiscal = async (req, res) => {
    try {
        const { tabela } = req.params; // ex: 'cfop', 'ncm', 'cst'
        
        const response = await axios.get(`${getApiFiscalUrl()}/tabelas-fiscais/${tabela}`, getApiFiscalAuthHeaders());
        
        res.status(200).json(response.data);
    } catch (error) {
        console.error(`Erro ao buscar tabela fiscal [${req.params.tabela}]:`, error.message);
        res.status(error.response?.status || 500).json({ message: `Erro ao buscar dados de ${req.params.tabela}` });
    }
};

// POST: Cria um novo registro na tabela
export const criarRegistroTabelaFiscal = async (req, res) => {
    try {
        const { tabela } = req.params;
        const dados = req.body;

        const response = await axios.post(`${getApiFiscalUrl()}/tabelas-fiscais/${tabela}`, dados, getApiFiscalAuthHeaders());
        
        res.status(201).json(response.data);
    } catch (error) {
        console.error(`Erro ao criar registro na tabela [${req.params.tabela}]:`, error.message);
        res.status(error.response?.status || 500).json({ message: `Erro ao cadastrar novo código em ${req.params.tabela}` });
    }
};

export const listarRegrasTributarias = async (req, res) => {
    try {
        const { tipo } = req.params; // icms, ipi, pis-cofins, ibs-cbs
        
        // 🟢 CORRIGIDO: Agora aponta para /regras-tributarias/ do seu Módulo Fiscal
        const response = await axios.get(`${getApiFiscalUrl()}/regras-tributarias/${tipo}`, getApiFiscalAuthHeaders());
        
        res.status(200).json(response.data);
    } catch (error) {
        console.error(`Erro ao buscar regra [${req.params.tipo}]:`, error.message);
        res.status(200).json([]); // Retorna array vazio se não achar, pra não quebrar a tela
    }
};

// GET: Sugere a tributação baseada no NCM digitado
export const sugerirTributacaoNcm = async (req, res) => {
    try {
        const { ncm } = req.query;

        // 🟢 CORRIGIDO: Agora aponta para /regras-tributarias/sugerir
        const response = await axios.get(`${getApiFiscalUrl()}/regras-tributarias/sugerir?ncm=${ncm}`, getApiFiscalAuthHeaders());
        
        res.status(200).json(response.data);
    } catch (error) {
        res.status(200).json({}); 
    }
};