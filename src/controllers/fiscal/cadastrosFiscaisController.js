import axios from 'axios';

const getApiUrl = () => process.env.API_FISCAL_URL;
const getHeaders = () => ({
    headers: {
        'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

// 🟢 Adicionamos a injeção do tenant_id nas funções de CRIAR e ATUALIZAR
const criarCrudProxy = (rotaApi) => ({
    listar: async (req, res) => {
        try { const { data } = await axios.get(`${getApiUrl()}/${rotaApi}`, getHeaders()); res.status(200).json(data); } 
        catch (e) { res.status(e.response?.status || 500).json(e.response?.data || { message: `Erro ao listar ${rotaApi}` }); }
    },
    criar: async (req, res) => {
        try { 
            const payload = { ...req.body, tenant_id: String(req.tenantId) };
            const { data } = await axios.post(`${getApiUrl()}/${rotaApi}`, payload, getHeaders()); 
            res.status(201).json(data); 
        } catch (e) { res.status(e.response?.status || 500).json(e.response?.data || { message: `Erro ao criar ${rotaApi}` }); }
    },
    atualizar: async (req, res) => {
        try { 
            const payload = { ...req.body, tenant_id: String(req.tenantId) };
            const { data } = await axios.put(`${getApiUrl()}/${rotaApi}/${req.params.id}`, payload, getHeaders()); 
            res.status(200).json(data); 
        } catch (e) { res.status(e.response?.status || 500).json(e.response?.data || { message: `Erro ao atualizar ${rotaApi}` }); }
    },
    excluir: async (req, res) => {
        try { const { data } = await axios.delete(`${getApiUrl()}/${rotaApi}/${req.params.id}`, getHeaders()); res.status(200).json(data); } 
        catch (e) { res.status(e.response?.status || 500).json(e.response?.data || { message: `Erro ao excluir ${rotaApi}` }); }
    }
});

export const destinatariosCtrl = criarCrudProxy('destinatarios');
export const formasPagamentoCtrl = criarCrudProxy('formas-pagamento');
export const seriesCtrl = criarCrudProxy('series');