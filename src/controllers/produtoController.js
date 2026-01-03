import Produto from '../models/produtoModel.js';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import Categoria from '../models/categoriaModel.js';
import axios from 'axios';

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ============================================================================
//                              ROTAS PÚBLICAS
// ============================================================================

// @desc    Buscar todos os produtos (Apenas ATIVOS para o público)
export const getAllProdutos = async (req, res, next) => {
    try {
        // ✅ ATUALIZAÇÃO: Adicionado filtro { onlyActive: true }
        // Isso garante que o público só veja produtos ativos no ecommerce
        const produtos = await Produto.findAll({ onlyActive: true });
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getProdutosAgrupadosPorCategoria = async (req, res, next) => {
    try {
        // Busca todas as categorias
        const todasCategorias = await Categoria.findAll();

        // Para cada categoria, busca até 8 produtos
        const produtosAgrupados = await Promise.all(
            todasCategorias.map(async (categoria) => {
                // ✅ ATUALIZAÇÃO: O método findByCategoryName foi atualizado no Model para filtrar ativos
                const produtosDaCategoria = await Produto.findByCategoryName(categoria.nome, 8); // Limita a 8 produtos

                return {
                    category: {
                        id_categoria: categoria.id_categoria,
                        nome: categoria.nome
                    },
                    products: produtosDaCategoria
                };
            })
        );

        // Retorna apenas as categorias que têm produtos
        const resultadoFinal = produtosAgrupados.filter(grupo => grupo.products.length > 0);

        res.status(200).json(resultadoFinal);

    } catch (error) {
        next(error);
    }
};

// @desc    Buscar um produto por ID e incrementar a visualização
export const getProdutoById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const productId = Number(id);

        if (isNaN(productId)) {
            res.status(400);
            throw new Error('O ID do produto é inválido.');
        }

        const produto = await Produto.findById(productId);

        if (!produto) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }

        // ============================================================
        // ✅ ATUALIZAÇÃO: REGISTRAR VISUALIZAÇÃO NO HISTÓRICO
        // ============================================================
        try {
            const hoje = new Date();
            // Zera a hora para garantir que agrupe tudo no mesmo dia (00:00:00)
            hoje.setUTCHours(0, 0, 0, 0); 

            // 1. Salva na tabela nova (Histórico por dia)
            await prisma.produto_visualizacoes.upsert({
                where: {
                    // ❌ ANTES (ERRADO): uk_produto_data
                    // ✅ AGORA (CORRETO): id_produto_data
                    id_produto_data: { 
                        id_produto: productId,
                        data: hoje
                    }
                },
                update: { 
                    quantidade: { increment: 1 }
                },
                create: { 
                    id_produto: productId, 
                    data: hoje, 
                    quantidade: 1
                }
            });

            // 2. Mantém o contador total na tabela de produtos (para ordenação geral)
            // (Esta linha chama a função que já existia no seu Model)
            await Produto.incrementView(productId);

        } catch (viewError) {
            // Se der erro no log de view, apenas avisa no console e não trava o site
            console.error("Erro silencioso ao registrar visualização:", viewError.message);
        }
        // ============================================================

        res.status(200).json(produto);
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar produtos por categoria
export const getProdutosPorCategoria = async (req, res, next) => {
    try {
        const nomeCategoria = req.params.nome;
        // ✅ ATUALIZAÇÃO: findByCategoryName filtra ativos no Model
        const produtos = await Produto.findByCategoryName(nomeCategoria);
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar produtos por ID da Subcategoria
// @route   GET /api/produtos/sub/:id
export const getProdutosBySubcategoria = async (req, res, next) => {
    try {
        // O parâmetro 'id' aqui pode ser "4" (ID) ou "Smartphones" (Nome)
        const { id } = req.params; 
        
        let produtos;

        // Verificamos se é um número ou texto
        if (!isNaN(id)) {
            // Se for número, busca pelo ID (Mantém compatibilidade antiga)
            // ✅ ATUALIZAÇÃO: findBySubcategory filtra ativos no Model
            produtos = await Produto.findBySubcategory(id);
        } else {
            // Se for texto, decodifica (tira os %20) e busca pelo Nome
            const nomeDecodificado = decodeURIComponent(id);
            // ✅ ATUALIZAÇÃO: findBySubcategoryName filtra ativos no Model
            produtos = await Produto.findBySubcategoryName(nomeDecodificado);
        }
        
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar produtos por marca
export const getProdutosPorMarca = async (req, res, next) => {
    try {
        const nomeMarca = req.params.nome;
        // ✅ ATUALIZAÇÃO: findByBrandName filtra ativos no Model
        const produtos = await Produto.findByBrandName(nomeMarca);
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

// @desc    Pesquisar produtos
export const searchProdutos = async (req, res, next) => {
    try {
        const { keyword } = req.params;
        // ✅ ATUALIZAÇÃO: search filtra ativos no Model
        const produtos = await Produto.search(keyword);
        res.json(produtos);
    } catch (error) {
        next(error);
    }
};

// @desc    Filtrar produtos (para os banners)
export const getProdutosFiltrados = async (req, res, next) => {
    try {
        const { tipo, valor } = req.query;
        if (!tipo || !valor) {
            return res.status(400).json({ message: 'Tipo e valor do filtro são obrigatórios.' });
        }
        const produtos = await Produto.filterBy(tipo, valor);
        res.json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getPopularProdutos = async (req, res, next) => {
    try {
        // Busca os 8 produtos mais vistos para não sobrecarregar a homepage
        // ✅ ATUALIZAÇÃO: Adicionado filtro { onlyActive: true }
        const produtos = await Produto.findAll({ onlyActive: true });
        
        // Ordena em memória (já que findAll não suporta orderBy dinâmico com filtro ainda)
        const populares = produtos
            .sort((a, b) => b.visualizacoes - a.visualizacoes)
            .slice(0, 8);

        res.status(200).json(populares);
    } catch (error) {
        next(error);
    }
};


// ============================================================================
//                              ROTAS DE ADMIN
// ============================================================================

export const createProduto = async (req, res, next) => {
    try {
        const { 
            id_categoria, 
            id_subcategoria, 
            id_marca, 
            id_fornecedor, // 👈 Captura o ID do fornecedor
            subimagens = [], 
            active_ecommerce,
            ...productData 
        } = req.body;

        if (!productData.nome || productData.preco === undefined || !id_categoria || !id_marca) {
            res.status(400);
            throw new Error('Nome, preço, categoria e marca são campos obrigatórios.');
        }

        const dataToCreate = {
            ...productData,
            preco: Number(productData.preco),
            estoque: Number(productData.estoque),
            peso: Number(productData.peso),
            comprimento: Number(productData.comprimento),
            altura: Number(productData.altura),
            largura: Number(productData.largura),
            preco_custo: productData.preco_custo ? Number(productData.preco_custo) : 0,
            
            active_ecommerce: active_ecommerce !== undefined ? Boolean(active_ecommerce) : true,

            // Conexão com Categoria
            categorias: {
                connect: { id_categoria: Number(id_categoria) }
            },
            // Conexão com Marca
            marcas: {
                connect: { id_marca: Number(id_marca) }
            },
            // ✅ CONEXÃO COM FORNECEDOR (Tratado como relação)
            fornecedores: id_fornecedor ? {
                connect: { id_fornecedor: Number(id_fornecedor) }
            } : undefined,

            // Conexão com Subcategoria
            subcategorias: id_subcategoria ? {
                connect: { id_subcategoria: Number(id_subcategoria) }
            } : undefined,

            // Subimagens
            produto_subimagens: {
                create: subimagens.map((url, index) => ({
                    url: url,
                    ordem: index
                }))
            }
        };

        const produto = await Produto.create(dataToCreate);
        res.status(201).json(produto);
    } catch (error) {
        next(error);
    }
};

export const updateProduto = async (req, res, next) => {
    try {
        const { 
            id_categoria, id_subcategoria, id_marca, id_produto, 
            id_fornecedor, // 👈 ✅ NOVO CAMPO: Capturado para vincular ao fornecedor
            subimagens = [], 
            active_ecommerce, 
            ...productData 
        } = req.body;
        
        const productId = Number(req.params.id);

        // Prepara o objeto de atualização
        const dataToUpdate = {
            ...productData,
            preco: Number(productData.preco),
            estoque: Number(productData.estoque),
            peso: Number(productData.peso),
            comprimento: Number(productData.comprimento),
            altura: Number(productData.altura),
            largura: Number(productData.largura),
            
            // ✅ ATUALIZAÇÃO: Atualiza o status APENAS se foi enviado no body
            ...(active_ecommerce !== undefined && { active_ecommerce: Boolean(active_ecommerce) }),

            // Categoria (Obrigatório - Conecta a nova)
            categorias: id_categoria ? { 
                connect: { id_categoria: Number(id_categoria) } 
            } : undefined,

            // Marca (Obrigatório - Conecta a nova)
            marcas: id_marca ? { 
                connect: { id_marca: Number(id_marca) } 
            } : undefined,

            // ✅ NOVO: Lógica para Fornecedor
            // Se vier um ID, conecta. Se vier explicitamente null, desconecta.
            fornecedores: id_fornecedor 
                ? { connect: { id_fornecedor: Number(id_fornecedor) } } 
                : (id_fornecedor === null ? { disconnect: true } : undefined),

            // Lógica de Troca de Subcategoria
            subcategorias: id_subcategoria 
                ? { connect: { id_subcategoria: Number(id_subcategoria) } }
                : { disconnect: true }, 

            // Imagens
            produto_subimagens: {
                deleteMany: {},
                create: subimagens.map((url, index) => ({ url: url, ordem: index }))
            }
        };

        // Limpeza de chaves undefined (exceto subcategorias que tratamos acima)
        Object.keys(dataToUpdate).forEach(key => {
            if (dataToUpdate[key] === undefined) delete dataToUpdate[key];
        });

        // Se subimagens não foi enviado no payload, removemos para não apagar as existentes
        if (!req.body.subimagens) delete dataToUpdate.produto_subimagens;

        // --- TENTATIVA DE ATUALIZAÇÃO ---
        let produtoAtualizado;
        
        try {
            // Tenta atualizar normalmente
            produtoAtualizado = await Produto.update(productId, dataToUpdate);
        } catch (prismaError) {
            // ⚠️ TRATAMENTO DE ERRO P2025 (Record not found)
            if (prismaError.code === 'P2025') {
                delete dataToUpdate.subcategorias;
                produtoAtualizado = await Produto.update(productId, dataToUpdate);
            } else {
                throw prismaError; // Se for outro erro, repassa pra frente
            }
        }

        // --- SINCRONIZAÇÃO COM MERCADO LIVRE ---
        if (produtoAtualizado && produtoAtualizado.mercado_livre_id) {
            console.log(`🔄 Tentando atualizar produto ${produtoAtualizado.mercado_livre_id} no Mercado Livre...`);
            
            try {
                const accessToken = await getValidAccessToken();
                
                let pictures = [];
                if (produtoAtualizado.imagem_url) pictures.push({ source: produtoAtualizado.imagem_url });
                
                if (subimagens.length > 0) {
                     subimagens.forEach(url => pictures.push({ source: url }));
                }

                const mlUpdateData = {
                    title: produtoAtualizado.nome.substring(0, 60),
                    price: parseFloat(produtoAtualizado.preco),
                    available_quantity: parseInt(produtoAtualizado.estoque),
                    pictures: pictures.length > 0 ? pictures : undefined
                };

                await axios.put(`https://api.mercadolibre.com/items/${produtoAtualizado.mercado_livre_id}`, 
                    mlUpdateData, 
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );

                console.log("✅ Produto atualizado no Mercado Livre com sucesso.");

            } catch (mlError) {
                const errorData = mlError.response?.data;
                console.error("⚠️ Erro ao atualizar no ML:", JSON.stringify(errorData, null, 2));

                const isNotFound = mlError.response && mlError.response.status === 404;
                const isClosed = errorData && errorData.message && errorData.message.includes('status:closed');

                if (isNotFound || isClosed) {
                    console.log(`Produto ${produtoAtualizado.mercado_livre_id} inacessível/fechado. Resetando vínculo...`);
                    await Produto.update(productId, { mercado_livre_id: null, ml_status: null });
                    produtoAtualizado.mercado_livre_id = null;
                    produtoAtualizado.ml_status = null;
                }
            }
        }

        res.json(produtoAtualizado);

    } catch (error) {
        next(error);
    }
};

// ✅ NOVA FUNÇÃO: Toggle Rápido de Status (Ativar/Desativar)
export const toggleProductEcommerce = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const produto = await Produto.findById(productId);

        if (!produto) {
            return res.status(404).json({ message: 'Produto não encontrado' });
        }

        // Inverte o status atual
        const novoStatus = !produto.active_ecommerce;
        
        const produtoAtualizado = await Produto.toggleEcommerce(productId, novoStatus);

        res.json({ 
            message: `Produto ${novoStatus ? 'ativado' : 'desativado'} no E-commerce`, 
            active_ecommerce: produtoAtualizado.active_ecommerce 
        });
    } catch (error) {
        next(error);
    }
};

export const deleteProduto = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const produto = await Produto.findById(productId);

        if (produto && produto.mercado_livre_id) {
            try {
                const accessToken = await getValidAccessToken();

                await axios.put(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}`,
                    { status: 'paused' },
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                console.log(`Anúncio ${produto.mercado_livre_id} pausado no Mercado Livre.`);

            } catch (mlError) {
                console.error("Aviso: Não foi possível pausar o anúncio no Mercado Livre.", mlError.response?.data || mlError.message);
            }
        }

        await Produto.remove(productId);
        res.json({ message: 'Produto removido com sucesso' });

    } catch (error) {
        next(error);
    }
};

export const publishToMercadoLivre = async (req, res, next) => {
    try {
        const { id: productId } = req.params;
        // A função findById agora já inclui as subimagens (graças à mudança no Model).
        const produto = await Produto.findById(Number(productId));

        if (!produto) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }
        if (!produto.ml_category_id) {
            return res.status(400).json({ message: 'O produto não possui uma Categoria do Mercado Livre.' });
        }

        const tituloAnuncio = produto.nome.substring(0, 60);
        const attributes = Array.isArray(produto.ml_attributes) ? produto.ml_attributes : [];
        const accessToken = await getValidAccessToken();

        // ATUALIZAÇÃO: Junta a imagem principal com as sub-imagens para o anúncio.
        let pictures = [];
        if (produto.imagem_url) {
            pictures.push({ source: produto.imagem_url });
        }
        // Usa o nome correto da relação: 'produto_subimagens'
        if (produto.produto_subimagens && produto.produto_subimagens.length > 0) {
            const subPictures = produto.produto_subimagens.map(img => ({ source: img.url }));
            pictures = [...pictures, ...subPictures];
        }

        if (pictures.length === 0) {
            return res.status(400).json({ message: 'O produto precisa ter pelo menos uma imagem para ser publicado.' });
        }

        const anuncio = {
            title: tituloAnuncio,
            category_id: produto.ml_category_id,
            price: parseFloat(produto.preco),
            currency_id: "BRL",
            available_quantity: produto.estoque,
            buying_mode: "buy_it_now",
            listing_type_id: "gold_special",
            condition: "new",
            description: { plain_text: produto.descricao },
            pictures: pictures, // Usa a lista combinada de imagens
            attributes: attributes,
            shipping: {
                mode: "me2"
            }
        };

        const { data } = await axios.post('https://api.mercadolibre.com/items', anuncio, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        await Produto.update(produto.id_produto, {
            mercado_livre_id: data.id,
            ml_status: data.status
        });

        res.json({ message: 'Produto publicado com sucesso no Mercado Livre!', url: data.permalink });

    } catch (error) {
        console.error("❌ Erro ao publicar no Mercado Livre:", error.response?.data || error.message);
        const mlErrors = error.response?.data?.cause?.map(err => err.message).join(', ') || 'Erro desconhecido.';
        const errorMessage = error.response?.data?.message || 'Não foi possível publicar o produto no Mercado Livre.';

        res.status(500).json({
            message: `${errorMessage}`,
            details: mlErrors
        });
    }
};

// ✅ NOVA FUNÇÃO
// @desc    Atualizar o status de um anúncio no Mercado Livre (Admin)
export const updateMercadoLivreStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const produto = await Produto.findById(Number(req.params.id));

        if (!produto || !produto.mercado_livre_id) {
            return res.status(404).json({ message: 'Anúncio não encontrado.' });
        }

        // 1. CHECAGEM PREVENTIVA: Se o banco já sabe que está fechado, nem tenta contato com a API.
        // Já reseta direto para liberar a publicação.
        if (produto.ml_status === 'closed') {
            console.log(`Produto ${produto.id_produto} já consta como 'closed'. Resetando vínculo...`);
            await Produto.update(produto.id_produto, { mercado_livre_id: null, ml_status: null });
            return res.json({
                message: 'Este anúncio estava fechado. O sistema liberou para uma nova publicação.',
                reset: true
            });
        }

        const accessToken = await getValidAccessToken();

        try {
            const { data } = await axios.put(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}`,
                { status: status },
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            await Produto.update(produto.id_produto, { ml_status: data.status });
            res.json({ message: `Status atualizado para ${data.status}`, status: data.status });

        } catch (mlError) {
            console.error("Erro ML ao atualizar status:", mlError.response?.data || mlError.message);

            const errorData = mlError.response?.data;

            // 2. DETECÇÃO ROBUSTA DE ERROS
            // Verifica se é 404 (Não existe)
            const isNotFound = mlError.response && mlError.response.status === 404;

            // Verifica se a mensagem diz "closed"
            const messageIsClosed = errorData && errorData.message && errorData.message.includes('status:closed');

            // Verifica os códigos de erro específicos do seu log (not_modifiable)
            const causes = errorData?.cause || [];
            const isNotModifiable = causes.some(c => 
                c.code === 'item.title.not_modifiable' || 
                c.code === 'item.price.not_modifiable' || 
                c.code === 'item.status.not_modifiable' ||
                c.code === 'field_not_updatable'
            );

            // SE for qualquer um desses casos, o anúncio já era. Resetamos.
            if (isNotFound || messageIsClosed || isNotModifiable) {
                console.log(`Anúncio ${produto.mercado_livre_id} irrecuperável. Resetando...`);

                await Produto.update(produto.id_produto, {
                    mercado_livre_id: null,
                    ml_status: null
                });

                return res.json({
                    message: 'O anúncio original foi encerrado e não pode ser modificado. O sistema liberou o produto para uma NOVA publicação.',
                    reset: true
                });
            }

            // Se for outro erro (ex: token inválido, internet), lança o erro normal
            throw mlError;
        }

    } catch (error) {
        console.error("Erro final updateMercadoLivreStatus:", error.message);
        res.status(500).json({ message: 'Erro ao comunicar com Mercado Livre.' });
    }
};

// ✅ NOVA FUNÇÃO
// @desc    Sincronizar o status de um anúncio do Mercado Livre (Admin)
export const syncMercadoLivreStatus = async (req, res, next) => {
    try {
        const produto = await Produto.findById(Number(req.params.id));

        if (!produto || !produto.mercado_livre_id) {
            return res.status(404).json({ message: 'Este produto não está vinculado ao Mercado Livre.' });
        }

        const accessToken = await getValidAccessToken();

        try {
            // Tenta buscar o status atual no ML
            const { data } = await axios.get(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}?attributes=status`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            await Produto.update(produto.id_produto, { ml_status: data.status });
            res.json({ message: 'Status sincronizado com sucesso!', status: data.status });

        } catch (mlError) {
            // SE O PRODUTO NÃO EXISTIR MAIS NO ML (DELETADO LÁ)
            if (mlError.response && mlError.response.status === 404) {
                console.log(`Produto ${produto.mercado_livre_id} não encontrado no ML. Desvinculando...`);

                // Limpa os dados do ML no banco local
                await Produto.update(produto.id_produto, {
                    mercado_livre_id: null,
                    ml_status: null
                });

                return res.json({
                    message: 'O anúncio foi removido do Mercado Livre. O sistema liberou para nova publicação.',
                    status: null,
                    reset: true // Flag para o frontend saber se precisar
                });
            }
            throw mlError; // Outros erros repassa pro catch principal
        }

    } catch (error) {
        console.error("Erro ao sincronizar status do ML:", error.response?.data || error.message);
        // Não quebra a aplicação, mas avisa o usuário
        res.status(500).json({ message: 'Não foi possível contatar o Mercado Livre.' });
    }
};