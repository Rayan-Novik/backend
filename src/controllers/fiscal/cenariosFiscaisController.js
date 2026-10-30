import axios from 'axios';

const getApiUrl = () => process.env.API_FISCAL_URL;
const getHeaders = () => ({
    headers: {
        'Authorization': `Bearer ${process.env.API_FISCAL_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

export const listarCenarios = async (req, res) => {
    try {
        const { data } = await axios.get(`${getApiUrl()}/cenarios`, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao listar cenários.' });
    }
};

export const criarCenario = async (req, res) => {
    try {
        const { data } = await axios.post(`${getApiUrl()}/cenarios`, req.body, getHeaders());
        res.status(201).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao criar cenário.' });
    }
};

export const atualizarCenario = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.put(`${getApiUrl()}/cenarios/${id}`, req.body, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao atualizar cenário.' });
    }
};

export const excluirCenario = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await axios.delete(`${getApiUrl()}/cenarios/${id}`, getHeaders());
        res.status(200).json(data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { message: 'Erro ao excluir cenário.' });
    }
};