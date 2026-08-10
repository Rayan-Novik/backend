import axios from 'axios';
import FormData from 'form-data';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import ConfiguracaoModel from '../models/configuracaoModel.js';

export const checkAuth = async (req, res) => {
    try {
        const accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN', req.tenantId);
        
        if (accessToken) {
            res.json({ isAuthenticated: true });
        } else {
            res.json({ isAuthenticated: false });
        }
    } catch (error) {
        res.json({ isAuthenticated: false });
    }
};

export const getCategoryAttributes = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        if (!categoryId) {
            return res.status(400).json({ message: 'O ID da categoria é obrigatório.' });
        }

        const accessToken = await getValidAccessToken(req.tenantId);
        
        const { data } = await axios.get(`https://api.mercadolibre.com/categories/${categoryId}/attributes`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        res.json(data);

    } catch (error) {
        console.error("Erro ao buscar atributos da categoria no ML:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ message: 'Não foi possível buscar os atributos da categoria.' });
    }
};

export const getMainCategories = async (req, res, next) => {
    try {
        const accessToken = await getValidAccessToken(req.tenantId);
        const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/categories', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        res.json(data);
    } catch (error) {
        console.error("Erro ao buscar categorias principais do ML:", error.response?.data || error.message);
        res.status(500).json({ message: 'Não foi possível buscar as categorias principais.' });
    }
};

export const getCategoryDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const accessToken = await getValidAccessToken(req.tenantId);
        const { data } = await axios.get(`https://api.mercadolibre.com/categories/${id}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        res.json(data);
    } catch (error) {
        console.error("Erro ao buscar detalhes da categoria do ML:", error.response?.data || error.message);
        res.status(404).json({ message: 'Categoria não encontrada ou erro na busca.' });
    }
};

export const getSellerOrders = async (req, res) => {
    try {
        const accessToken = await getValidAccessToken(req.tenantId);

        const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const sellerId = userData.id;

        if (!sellerId) {
            return res.status(404).json({ message: 'ID do vendedor não encontrado.' });
        }
        
        const { data: ordersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                seller: sellerId,
                sort: 'date_desc', 
                limit: 50 
            }
        });

        res.json(ordersData);

    } catch (error) {
        console.error("Erro ao buscar pedidos no ML:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ message: 'Não foi possível buscar os pedidos.' });
    }
};

export const getSellerOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'O ID do pedido é obrigatório.' });
        }

        const accessToken = await getValidAccessToken(req.tenantId);

        const { data } = await axios.get(`https://api.mercadolibre.com/orders/${id}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        res.json(data);

    } catch (error) {
        console.error("Erro ao buscar detalhes do pedido no ML:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ message: 'Não foi possível buscar os detalhes do pedido.' });
    }
};

export const uploadInvoice = async (req, res) => {
    try {
        const { shipment_id } = req.params;

        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo XML de nota fiscal foi enviado.' });
        }

        const accessToken = await getValidAccessToken(req.tenantId);

        const form = new FormData();
        form.append('invoice_file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: 'application/xml',
        });

        await axios.post(
            `https://api.mercadolibre.com/shipments/${shipment_id}/invoice_data`,
            form,
            {
                headers: {
                    ...form.getHeaders(), 
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        res.status(200).json({ message: 'Nota Fiscal enviada com sucesso!' });

    } catch (error) {
        console.error("Erro ao enviar a Nota Fiscal para o ML:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ message: 'Não foi possível enviar a Nota Fiscal.' });
    }
};

export const getMlQuestions = async (req, res) => {
    try {
        const accessToken = await getValidAccessToken(req.tenantId);

        const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const { data: questionsData } = await axios.get('https://api.mercadolibre.com/questions/search', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: {
                seller_id: userData.id,
                sort: 'date_desc',
                limit: 50 
            }
        });

        const questions = questionsData.questions || [];

        const questionsWithDetails = await Promise.all(questions.map(async (q) => {
            try {
                const itemRes = await axios.get(`https://api.mercadolibre.com/items/${q.item_id}`);
                
                return { 
                    ...q, 
                    item_status: itemRes.data.status,
                    product_title: itemRes.data.title, 
                    product_image: itemRes.data.thumbnail 
                };
            } catch (err) {
                return { ...q, item_status: 'unknown' };
            }
        }));

        res.json(questionsWithDetails);
    } catch (error) {
        console.error("Erro ao carregar perguntas:", error.message);
        res.status(500).json({ message: 'Erro ao carregar histórico de perguntas.' });
    }
};

export const answerQuestion = async (req, res) => {
    try {
        const { question_id, text } = req.body;
        
        if (!question_id || !text) {
            return res.status(400).json({ message: 'ID da pergunta e texto são obrigatórios.' });
        }

        const accessToken = await getValidAccessToken(req.tenantId);

        const { data } = await axios.post('https://api.mercadolibre.com/answers', 
            { question_id, text },
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        res.json({ message: 'Pergunta respondida com sucesso!', data });
    } catch (error) {
        console.error("Erro ao responder pergunta no ML:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.message || 'Não foi possível enviar a resposta.';
        res.status(error.response?.status || 500).json({ message: errorMsg });
    }
};