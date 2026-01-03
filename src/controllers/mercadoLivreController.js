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

/**
 * @desc    Buscar perguntas não respondidas do vendedor
 * @route   GET /api/mercadolivre/questions
 */
export const getMlQuestions = async (req, res) => {
    try {
        const accessToken = await getValidAccessToken();

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
                // 1. Busca os dados em tempo real no Mercado Livre
                const itemRes = await axios.get(`https://api.mercadolibre.com/items/${q.item_id}`);
                
                // 2. ✅ PARTE NOVA: Busca o produto correspondente no seu banco de dados local
                // Procura um produto onde o campo id_mercadolivre seja igual ao item_id da pergunta
                // const produtoLocal = await Produto.findOne({ where: { id_mercadolivre: q.item_id } });

                return { 
                    ...q, 
                    item_status: itemRes.data.status,
                    // Se encontrar no seu banco, usa sua imagem e título, senão usa o do ML
                    product_title: itemRes.data.title, // produtoLocal ? produtoLocal.nome : itemRes.data.title
                    product_image: itemRes.data.thumbnail // produtoLocal ? produtoLocal.imagem_url : itemRes.data.thumbnail
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

/**
 * @desc    Responder uma pergunta específica
 * @route   POST /api/mercadolivre/questions/answer
 */
export const answerQuestion = async (req, res) => {
    try {
        const { question_id, text } = req.body;
        
        if (!question_id || !text) {
            return res.status(400).json({ message: 'ID da pergunta e texto são obrigatórios.' });
        }

        const accessToken = await getValidAccessToken();

        // No Mercado Livre, o endpoint para responder é /answers
        const { data } = await axios.post('https://api.mercadolibre.com/answers', 
            { question_id, text },
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        res.json({ message: 'Pergunta respondida com sucesso!', data });
    } catch (error) {
        // Log detalhado para capturar erros específicos do ML (ex: pergunta já respondida ou excluída)
        console.error("Erro ao responder pergunta no ML:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.message || 'Não foi possível enviar a resposta.';
        res.status(error.response?.status || 500).json({ message: errorMsg });
    }
};