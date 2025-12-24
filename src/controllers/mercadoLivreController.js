// controllers/mercadoLivreController.js
import axios from 'axios';
import { getValidAccessToken } from '../services/mercadoLivreService.js';

/**
 * @desc    Buscar os atributos de uma categoria do Mercado Livre
 * @route   GET /api/mercadolivre/attributes/:categoryId
 * @access  Private/Admin
 */
export const getCategoryAttributes = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        if (!categoryId) {
            return res.status(400).json({ message: 'O ID da categoria é obrigatório.' });
        }

        const accessToken = await getValidAccessToken();
        
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

/**
 * @desc    Buscar as categorias principais (nível raiz) do Mercado Livre
 * @route   GET /api/mercadolivre/categories
 * @access  Private/Admin
 */
export const getMainCategories = async (req, res, next) => {
    try {
        const accessToken = await getValidAccessToken();
        const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/categories', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        res.json(data);
    } catch (error) {
        console.error("Erro ao buscar categorias principais do ML:", error.response?.data || error.message);
        res.status(500).json({ message: 'Não foi possível buscar as categorias principais.' });
    }
};

/**
 * @desc    Buscar os detalhes (incluindo subcategorias) de uma categoria específica
 * @route   GET /api/mercadolivre/categories/:id
 * @access  Private/Admin
 */
export const getCategoryDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const accessToken = await getValidAccessToken();
        const { data } = await axios.get(`https://api.mercadolibre.com/categories/${id}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        res.json(data);
    } catch (error) {
        console.error("Erro ao buscar detalhes da categoria do ML:", error.response?.data || error.message);
        res.status(404).json({ message: 'Categoria não encontrada ou erro na busca.' });
    }
};

/**
 * @desc      Buscar os pedidos do vendedor no Mercado Livre
 * @route     GET /api/mercadolivre/orders
 * @access    Private/Admin
 */
export const getSellerOrders = async (req, res) => {
    try {
        // 1. Obtém um token de acesso válido, renovando se necessário.
        const accessToken = await getValidAccessToken();

        // 2. Primeiro, busca os dados do usuário logado para obter o ID do vendedor.
        const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const sellerId = userData.id;

        if (!sellerId) {
            return res.status(404).json({ message: 'ID do vendedor não encontrado.' });
        }
        
        // 3. Busca os pedidos associados a esse vendedor, ordenados pelos mais recentes.
        const { data: ordersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                seller: sellerId,
                sort: 'date_desc', // Ordena por data descendente (mais recentes primeiro)
                limit: 50 // Limita a 50 resultados por página (ajuste conforme necessário)
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

        const accessToken = await getValidAccessToken();

        // A API do ML para buscar um pedido por ID é esta:
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

        // 1. Verifica se um arquivo foi enviado
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo XML de nota fiscal foi enviado.' });
        }

        const accessToken = await getValidAccessToken();

        // 2. Prepara os dados do formulário para enviar à API do ML
        const form = new FormData();
        // O arquivo XML precisa ser enviado como um buffer
        form.append('invoice_file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: 'application/xml',
        });

        // 3. Envia o arquivo para a API do Mercado Livre
        await axios.post(
            `https://api.mercadolibre.com/shipments/${shipment_id}/invoice_data`,
            form,
            {
                headers: {
                    ...form.getHeaders(), // Importante para multipart/form-data
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