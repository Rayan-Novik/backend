import axios from 'axios';

const getApiUrl = () => process.env.API_FISCAL_URL;
const getHeaders = () => ({
    headers: {
        'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

export const listarNotas = async (req, res) => {
    try {
        const { data } = await axios.get(`${getApiUrl()}/notas`, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao listar notas.' });
    }
};

export const reenviarNota = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.post(`${getApiUrl()}/notas/${id}/reenviar`, {}, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao reenviar nota.' });
    }
};

export const cancelarNota = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.post(`${getApiUrl()}/notas/${id}/cancelar`, req.body, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao cancelar nota.' });
    }
};

export const cartaCorrecao = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.post(`${getApiUrl()}/notas/${id}/cce`, req.body, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao emitir CC-e.' });
    }
};

export const baixarPdfNota = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 🟢 A MÁGICA AQUI: responseType 'arraybuffer' para não corromper o binário
        const response = await axios.get(`${getApiUrl()}/notas/${id}/pdf`, {
            headers: {
                'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`
            },
            responseType: 'arraybuffer' 
        });

        // 🟢 Avisa o React que o que está sendo enviado é um arquivo PDF puro
        res.setHeader('Content-Type', 'application/pdf');
        res.status(200).send(response.data);
        
    } catch (error) {
        res.status(error.response?.status || 500).json({ message: 'Erro ao baixar PDF.' });
    }
};

export const listarEventosNota = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.get(`${getApiUrl()}/notas/${id}/eventos`, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao buscar eventos.' });
    }
};

export const notaEspecial = async (req, res) => {
    try {
        const { tipo } = req.params; // devolucao, complementar, ajuste
        const { data } = await axios.post(`${getApiUrl()}/notas/${tipo}`, req.body, getHeaders());
        res.status(201).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: `Erro ao gerar nota de ${req.params.tipo}.` });
    }
};