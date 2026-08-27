import Produto from '../models/produtoModel.js';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import { syncEstoqueIfoodAutomated } from './integration/ifood/produtoIfoodController.js';
import slugify from 'slugify';
import Categoria from '../models/categoriaModel.js';
import axios from 'axios';

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getAllProdutos = async (req, res, next) => {
    try {
        const produtos = await prisma.produtos.findMany({
            where: { id_tenant: req.tenantId },
            orderBy: { id_produto: 'desc' },
            include: {
                categorias: true,
                subcategorias: true,
                marcas: true,
                produto_variacoes: true,
                // 🟢 MÁGICA AQUI: Agora a lista principal carrega os adicionais!
                grupos_complemento: {
                    orderBy: { ordem: 'asc' },
                    include: {
                        complementos: {
                            include: {
                                produto_add: {
                                    select: { id_produto: true, nome: true, imagem_url: true }
                                }
                            }
                        }
                    }
                }
            }
        });
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getProdutosAgrupadosPorCategoria = async (req, res, next) => {
    try {
        const todasCategorias = await Categoria.findAll(req.tenantId);

        const produtosAgrupados = await Promise.all(
            todasCategorias.map(async (categoria) => {
                const produtosDaCategoria = await Produto.findByCategoryName(categoria.nome, req.tenantId, 8);

                return {
                    category: {
                        id_categoria: categoria.id_categoria,
                        nome: categoria.nome
                    },
                    products: produtosDaCategoria
                };
            })
        );

        const resultadoFinal = produtosAgrupados.filter(grupo => grupo.products.length > 0);
        res.status(200).json(resultadoFinal);
    } catch (error) {
        next(error);
    }
};

export const getProdutoById = async (req, res, next) => {
    try {
        const { id } = req.params;
        let productId;

        if (!isNaN(id)) {
            productId = Number(id);
        } else {
            const produtoPorSlug = await prisma.produtos.findFirst({
                where: {
                    slug: id,
                    id_tenant: req.tenantId
                },
                select: { id_produto: true }
            });

            if (produtoPorSlug) {
                productId = produtoPorSlug.id_produto;
            } else {
                const parts = id.split('-');
                const potentialId = parts[parts.length - 1];

                if (!isNaN(potentialId)) {
                    productId = Number(potentialId);
                } else {
                    return res.status(400).json({ message: 'URL do produto inválida.' });
                }
            }
        }

        const produto = await Produto.findById(productId, req.tenantId);

        if (!produto) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }

        try {
            const hoje = new Date();
            hoje.setUTCHours(0, 0, 0, 0);

            try {
                await prisma.produto_visualizacoes.upsert({
                    where: {
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
                        quantidade: 1,
                        id_tenant: req.tenantId 
                    }
                });
            } catch (upsertError) {
                if (upsertError.code !== 'P2002') {
                    console.error("Erro ao registrar visualização diária:", upsertError.message);
                }
            }

            await Produto.incrementView(productId, req.tenantId);

        } catch (viewError) {
            console.error("Erro geral na contagem de visualização:", viewError.message);
        }

        res.status(200).json(produto);
    } catch (error) {
        next(error);
    }
};

export const getProdutosPorCategoria = async (req, res, next) => {
    try {
        const produtos = await Produto.findByCategoryName(req.params.nome, req.tenantId);
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getProdutosBySubcategoria = async (req, res, next) => {
    try {
        const { id } = req.params;
        let produtos;

        if (!isNaN(id)) {
            produtos = await Produto.findBySubcategory(id, req.tenantId);
        } else {
            const nomeDecodificado = decodeURIComponent(id);
            produtos = await Produto.findBySubcategoryName(nomeDecodificado, req.tenantId);
        }

        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getProdutosPorMarca = async (req, res, next) => {
    try {
        const produtos = await Produto.findByBrandName(req.params.nome, req.tenantId);
        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

export const searchProdutos = async (req, res, next) => {
    try {
        const rawKeyword = req.query.q || req.params.keyword;
        const type = req.query.type || 'geral';

        if (!rawKeyword) return res.status(200).json([]);

        const keyword = String(rawKeyword).trim();
        if (!req.tenantId) return res.status(401).json({ message: "Acesso Negado: Loja não identificada." });

        let dynamicWhere = {};
        const isApenasNumeros = /^\d+$/.test(keyword);
        const isNumeroSeguroParaId = isApenasNumeros && Number(keyword) <= 2147483647;
        const condicoesOR = [];

        condicoesOR.push({ nome: { contains: keyword } });
        condicoesOR.push({ id_externo: { contains: keyword } });
        if (isNumeroSeguroParaId) condicoesOR.push({ id_produto: Number(keyword) });

        if (type === 'nome') dynamicWhere = { nome: { contains: keyword } };
        else if (type === 'codigo') dynamicWhere = { OR: [{ id_externo: { contains: keyword } }, ...(isNumeroSeguroParaId ? [{ id_produto: Number(keyword) }] : [])] };
        else dynamicWhere = { OR: condicoesOR };

        const produtos = await prisma.produtos.findMany({
            where: {
                id_tenant: Number(req.tenantId),
                ...dynamicWhere
            },
            include: {
                marcas: { select: { nome: true } },
                categorias: { select: { nome: true } },
                produto_variacoes: true 
            },
            take: 50
        });

        res.status(200).json(produtos);
    } catch (error) {
        console.error("❌ Erro na busca de produtos:", error);
        res.status(500).json({ message: "Erro ao buscar produto." });
    }
};

export const getProdutosFiltrados = async (req, res, next) => {
    try {
        const { tipo, valor } = req.query;
        if (!tipo || !valor) {
            return res.status(400).json({ message: 'Tipo e valor do filtro são obrigatórios.' });
        }
        const produtos = await Produto.filterBy(tipo, valor, req.tenantId);
        res.json(produtos);
    } catch (error) {
        next(error);
    }
};

export const getPopularProdutos = async (req, res, next) => {
    try {
        const produtos = await Produto.findAll(req.tenantId, { onlyActive: true });

        const populares = produtos
            .sort((a, b) => b.visualizacoes - a.visualizacoes)
            .slice(0, 8);

        res.status(200).json(populares);
    } catch (error) {
        next(error);
    }
};

export const createProduto = async (req, res, next) => {
    try {
        const {
            id_categoria, id_subcategoria, id_marca, id_fornecedor,
            subimagens = [], ml_attributes, composicao_pai = [],
            active_ecommerce, tipo_produto = 'FINAL', estoque_minimo = 0, unidade = 'UN',
            motivo_rastreio, origem_rastreio, variacoes = [], duracao_minutos,
            grupos_complemento = [], 
            ...productData
        } = req.body;

        if (!productData.nome || productData.preco === undefined) {
            res.status(400);
            throw new Error('Nome e preço são campos obrigatórios.');
        }

        // 🟢 CORREÇÃO: Só zera o estoque inserido manualmente se o cara mandou variações de verdade
        const estoqueTotal = variacoes && variacoes.length > 0
            ? variacoes.reduce((acc, v) => acc + (Number(v.estoque) || 0), 0)
            : (Number(productData.estoque) || 0);

        const slugGerado = slugify(productData.nome, {
            lower: true,      
            strict: true,     
            locale: 'pt'      
        });
        const slugUnico = `${slugGerado}-${Date.now().toString().slice(-4)}`;

        const dataToCreate = {
            id_tenant: req.tenantId,
            slug: slugUnico,
            ...productData,
            id_externo: productData.id_externo ? String(productData.id_externo).trim() : null,
            preco: Number(productData.preco),
            estoque: estoqueTotal,
            peso: Number(productData.peso) || 0,
            comprimento: Number(productData.comprimento) || 0,
            altura: Number(productData.altura) || 0,
            largura: Number(productData.largura) || 0,
            preco_custo: productData.preco_custo ? Number(productData.preco_custo) : 0,
            unidade: unidade,
            tipo_produto: tipo_produto,
            tempo_duracao: tipo_produto === 'SERVICO' ? (Number(duracao_minutos) || 60) : null,
            estoque_minimo: Number(estoque_minimo),
            active_ecommerce: active_ecommerce !== undefined ? Boolean(active_ecommerce) : true,
            ml_attributes: ml_attributes ? ml_attributes : undefined,
            id_categoria: id_categoria ? Number(id_categoria) : undefined,
            id_subcategoria: id_subcategoria ? Number(id_subcategoria) : undefined,
            id_marca: id_marca ? Number(id_marca) : undefined,
            id_fornecedor: id_fornecedor ? Number(id_fornecedor) : undefined,
            produto_subimagens: subimagens.length > 0 ? {
                create: subimagens.map((url, index) => ({ url: url, ordem: index }))
            } : undefined,
            composicao_pai: (tipo_produto === 'MISTO' && composicao_pai.length > 0) ? {
                create: composicao_pai.map(item => ({
                    id_insumo: Number(item.id_insumo),
                    quantidade_necessaria: Number(item.quantidade_necessaria)
                }))
            } : undefined,
            produto_variacoes: variacoes.length > 0 ? {
                create: variacoes.map(v => ({
                    id_tenant: req.tenantId,
                    cor: v.cor || null,
                    tamanho: v.tamanho ? String(v.tamanho) : null,
                    estoque: Number(v.estoque) || 0,
                    preco_adicional: Number(v.preco_adicional) || 0,
                    sku: v.sku || null
                }))
            } : undefined,
            // 🟢 CRIAÇÃO DOS ADICIONAIS / PERSONALIZAÇÃO
            grupos_complemento: grupos_complemento.length > 0 ? {
                create: grupos_complemento.map((grupo, index) => ({
                    id_tenant: req.tenantId,
                    nome: String(grupo.nome),
                    minimo: Number(grupo.minimo) || 0,
                    maximo: Number(grupo.maximo) || 1,
                    ordem: index,
                    tipo_grupo: String(grupo.tipo_grupo || 'CHOICE'),
                    complementos: {
                        create: (grupo.complementos || []).map(comp => ({
                            id_produto_add: Number(comp.id_produto_add),
                            preco_adicional: Number(comp.preco_adicional) || 0,
                            minimo: Number(comp.minimo) || 0,
                            maximo: Number(comp.maximo) || 1
                        }))
                    }
                }))
            } : undefined
        };

        Object.keys(dataToCreate).forEach(key => {
            if (dataToCreate[key] === undefined) delete dataToCreate[key];
        });

        const produto = await prisma.produtos.create({ data: dataToCreate });

        let id_usuario_logado = req.user.id_usuario;

        if (id_usuario_logado === 'DONO') {
            id_usuario_logado = null;
        } else {
            id_usuario_logado = Number(id_usuario_logado);
            const usuarioExiste = await prisma.usuarios.findUnique({
                where: { id_usuario: id_usuario_logado }
            });

            if (!usuarioExiste) {
                id_usuario_logado = null;
            }
        }

        await prisma.AuditoriaProduto.create({
            data: {
                id_produto: produto.id_produto,
                id_usuario: id_usuario_logado,
                id_tenant: req.tenantId,
                acao: 'CRIACAO',
                valor_novo: `Produto criado (${produto.tipo_produto}) - Estoque: ${produto.estoque}`
            }
        });

        if (tipo_produto !== 'SERVICO' && Number(produto.estoque) > 0) {
            await prisma.movimentacaoEstoque.create({
                data: {
                    id_produto: produto.id_produto,
                    quantidade: Number(produto.estoque),
                    tipo: 'ENTRADA',
                    saldo_momento: Number(produto.estoque),
                    motivo: motivo_rastreio || 'Cadastro Inicial',
                    origem_destino: origem_rastreio || 'Painel Admin',
                    usuario_id: id_usuario_logado
                }
            });
        }

        res.status(201).json(produto);

    } catch (error) {
        next(error);
    }
};

export const getComposicaoProduto = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const produto = await Produto.findById(productId, req.tenantId);

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });

        const receita = produto.composicao_pai ? produto.composicao_pai.map(item => ({
            id_insumo: item.id_insumo,
            nome: item.insumo.nome,
            unidade: item.insumo.unidade,
            quantidade_necessaria: item.quantidade_necessaria,
            estoque_atual_insumo: item.insumo.estoque
        })) : [];

        res.status(200).json(receita);
    } catch (error) {
        next(error);
    }
};

export const setComposicaoProduto = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const { itens } = req.body;

        if (!itens || !Array.isArray(itens)) return res.status(400).json({ message: "Formato inválido." });

        const temCiclo = itens.some(i => Number(i.id_insumo) === productId);
        if (temCiclo) return res.status(400).json({ message: "Produto não pode ser ingrediente dele mesmo." });

        await Produto.setComposicao(productId, itens, req.tenantId);
        res.status(200).json({ message: 'Receita salva com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const fabricarProduto = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const { quantidade } = req.body;
        const id_usuario = req.user.id_usuario;

        if (!quantidade || Number(quantidade) <= 0) return res.status(400).json({ message: "Quantidade inválida." });

        const produtoAtualizado = await Produto.fabricar(productId, Number(quantidade), id_usuario, req.tenantId);

        try {
            await syncEstoqueIfoodAutomated(req.tenantId, productId, produtoAtualizado.estoque);
        } catch (err) {
            console.error("Erro ao sincronizar estoque com iFood na fabricação:", err);
        }

        res.status(200).json({
            message: `Fabricação de ${quantidade} unidades concluída.`,
            novoEstoque: produtoAtualizado.estoque
        });
    } catch (error) {
        if (error.message.includes("Estoque insuficiente")) return res.status(400).json({ message: error.message });
        next(error);
    }
};

export const updateProduto = async (req, res, next) => {
    try {
        const {
            id_categoria,
            id_subcategoria,
            id_marca,
            id_produto,
            id_fornecedor,
            subimagens = [],
            active_ecommerce,
            motivo_rastreio,
            origem_rastreio,
            unidade,
            tipo_produto,
            id_tenant,
            variacoes,
            duracao_minutos,
            grupos_complemento, 
            ...productData
        } = req.body;
        const productId = Number(req.params.id);
        
        let id_usuario_logado = req.user.id_usuario;
        if (id_usuario_logado === 'DONO') {
            id_usuario_logado = null;
        } else {
            id_usuario_logado = Number(id_usuario_logado);
            const usuarioExiste = await prisma.usuarios.findUnique({
                where: { id_usuario: id_usuario_logado }
            });
            if (!usuarioExiste) {
                console.warn(`⚠️ Token fantasma! Usuário ID ${id_usuario_logado} não existe mais no banco. Evitando erro de Foreign Key.`);
                id_usuario_logado = null;
            }
        }

        const produtoAntes = await prisma.produtos.findFirst({
            where: {
                id_produto: productId,
                id_tenant: req.tenantId
            }
        });
        if (!produtoAntes) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }

        const logsAuditoria = [];
        const camposIgnorados = [
            'motivo_rastreio', 'origem_rastreio', 'subimagens', 'id_produto', 'visualizacoes',
            'data_criacao', 'data_atualizacao', 'ml_status', 'mercado_livre_id', 'id_externo',
            'tiktok_product_id', 'tiktok_video_url', 'url_shopee_original', 'custo',
            'composicao_pai', 'composicao_filho', 'ordens_producao', 'variacoes', 'grupos_complemento'
        ];

        Object.keys(req.body).forEach(campo => {
            if (camposIgnorados.includes(campo) || campo === 'id_tenant') return;
            const valorNovoRaw = req.body[campo];
            const valorAntigoRaw = produtoAntes[campo];
            const valorNovo = (valorNovoRaw === null || valorNovoRaw === undefined) ? '' : String(valorNovoRaw).trim();
            const valorAntigo = (valorAntigoRaw === null || valorAntigoRaw === undefined) ? '' : String(valorAntigoRaw).trim();
            if (valorNovo !== valorAntigo) {
                let valorNovoFormatado = valorNovo || 'Vazio';
                if (campo === 'estoque') {
                    valorNovoFormatado = `${valorNovo} (Motivo: ${motivo_rastreio || 'Edição'})`;
                }
                logsAuditoria.push({
                    id_produto: productId,
                    id_usuario: id_usuario_logado,
                    id_tenant: req.tenantId,
                    acao: 'EDICAO',
                    campo_alterado: campo.toUpperCase(),
                    valor_antigo: valorAntigo || 'Vazio',
                    valor_novo: valorNovoFormatado
                });
            }
        });

        const dataToUpdate = {
            ...productData,
            id_externo: productData.id_externo ? String(productData.id_externo).trim() : null,
            preco: productData.preco !== undefined ? Number(productData.preco) : undefined,
            estoque: productData.estoque !== undefined ? Number(productData.estoque) : undefined,
            peso: productData.peso !== undefined ? Number(productData.peso) : undefined,
            comprimento: productData.comprimento !== undefined ? Number(productData.comprimento) : undefined,
            altura: productData.altura !== undefined ? Number(productData.altura) : undefined,
            largura: productData.largura !== undefined ? Number(productData.largura) : undefined,
            estoque_minimo: productData.estoque_minimo !== undefined ? Number(productData.estoque_minimo) : undefined,
            unidade: unidade || undefined,
            tipo_produto: tipo_produto || undefined,
            tempo_duracao: tipo_produto === 'SERVICO' ? (Number(duracao_minutos) || 60) : null,
            ...(active_ecommerce !== undefined && { active_ecommerce: Boolean(active_ecommerce) }),
            categorias: id_categoria ? { connect: { id_categoria: Number(id_categoria) } } : undefined,
            marcas: id_marca ? { connect: { id_marca: Number(id_marca) } } : undefined,
            fornecedores: id_fornecedor ? { connect: { id_fornecedor: Number(id_fornecedor) } } : (id_fornecedor === null ? { disconnect: true } : undefined),
            subcategorias: id_subcategoria ? { connect: { id_subcategoria: Number(id_subcategoria) } } : (id_subcategoria === null ? { disconnect: true } : undefined),
            produto_subimagens: req.body.subimagens ? { deleteMany: {}, create: subimagens.map((url, index) => ({ url: url, ordem: index })) } : undefined,
            produto_variacoes: variacoes ? {
                deleteMany: {},
                create: variacoes.map(v => ({
                    id_tenant: req.tenantId,
                    cor: v.cor || null,
                    tamanho: String(v.tamanho || ''),
                    estoque: Number(v.estoque) || 0,
                    preco_adicional: Number(v.preco_adicional) || 0,
                    sku: v.sku || null
                }))
            } : undefined
        };

        // 🟢 CORREÇÃO: Só recalcula o estoque geral se enviarem variações. 
        // Se a lista for vazia (ex: Hambúrguer), não zera o estoque que o dono digitou.
        if (variacoes && variacoes.length > 0) {
            dataToUpdate.estoque = variacoes.reduce((acc, v) => acc + (Number(v.estoque) || 0), 0);
        }

        delete dataToUpdate.composicao_pai;
        delete dataToUpdate.composicao_filho;
        delete dataToUpdate.ordens_producao;

        Object.keys(dataToUpdate).forEach(key => {
            if (dataToUpdate[key] === undefined) {
                delete dataToUpdate[key];
            }
        });

        const produtoAtualizado = await prisma.$transaction(async (tx) => {
            if (logsAuditoria.length > 0) {
                await tx.AuditoriaProduto.createMany({ data: logsAuditoria });
            }
            if (dataToUpdate.estoque !== undefined && Number(dataToUpdate.estoque) !== Number(produtoAntes.estoque)) {
                const diferenca = Number(dataToUpdate.estoque) - Number(produtoAntes.estoque);
                await tx.movimentacaoEstoque.create({
                    data: {
                        id_produto: productId,
                        quantidade: Math.abs(diferenca),
                        tipo: diferenca > 0 ? 'ENTRADA' : 'SAIDA',
                        saldo_momento: Number(dataToUpdate.estoque),
                        motivo: motivo_rastreio || 'Ajuste Manual via Admin',
                        origem_destino: origem_rastreio || 'Edição de Produto',
                        usuario_id: id_usuario_logado
                    }
                });
            }

            // 🟢 ATUALIZAÇÃO DOS ADICIONAIS / PERSONALIZAÇÃO
            if (grupos_complemento) {
                await tx.produto_grupos_complemento.deleteMany({ where: { id_produto: productId, id_tenant: req.tenantId } });
                
                if (grupos_complemento.length > 0) {
                    for (let i = 0; i < grupos_complemento.length; i++) {
                        const grupo = grupos_complemento[i];
                        await tx.produto_grupos_complemento.create({
                            data: {
                                id_produto: productId,
                                id_tenant: req.tenantId,
                                nome: String(grupo.nome),
                                minimo: Number(grupo.minimo) || 0,
                                maximo: Number(grupo.maximo) || 1,
                                ordem: i,
                                tipo_grupo: String(grupo.tipo_grupo || 'CHOICE'),
                                complementos: {
                                    create: (grupo.complementos || []).map(comp => ({
                                        id_produto_add: Number(comp.id_produto_add),
                                        preco_adicional: Number(comp.preco_adicional) || 0,
                                        minimo: Number(comp.minimo) || 0,
                                        maximo: Number(comp.maximo) || 1
                                    }))
                                }
                            }
                        });
                    }
                }
            }

            return await tx.produtos.update({
                where: { id_produto: productId },
                data: dataToUpdate
            });
        }, { timeout: 15000 });

        if (dataToUpdate.estoque !== undefined) {
            try {
                await syncEstoqueIfoodAutomated(req.tenantId, productId, produtoAtualizado.estoque);
            } catch (err) {
                console.error("Erro ao sincronizar estoque com iFood na edição:", err);
            }
        }

        if (produtoAtualizado && produtoAtualizado.mercado_livre_id) {
            try {
                const accessToken = await getValidAccessToken();
                let pictures = [];
                if (produtoAtualizado.imagem_url) {
                    pictures.push({ source: produtoAtualizado.imagem_url });
                }
                if (subimagens.length > 0) {
                    subimagens.forEach(url => pictures.push({ source: url }));
                }
                const mlUpdateData = {
                    title: produtoAtualizado.nome.substring(0, 60),
                    price: parseFloat(produtoAtualizado.preco),
                    available_quantity: parseInt(produtoAtualizado.estoque),
                    pictures: pictures.length > 0 ? pictures : undefined
                };
                await axios.put(
                    `https://api.mercadolibre.com/items/${produtoAtualizado.mercado_livre_id}`,
                    mlUpdateData,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
            } catch (mlError) {
                const isNotFound = mlError.response && mlError.response.status === 404;
                if (isNotFound) {
                    await prisma.produtos.update({
                        where: { id_produto: productId },
                        data: { mercado_livre_id: null, ml_status: null }
                    });
                }
            }
        }
        res.json(produtoAtualizado);
    } catch (error) {
        console.error("Erro updateProduto:", error);
        next(error);
    }
};

export const getProdutoAuditoria = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) return res.status(400).json({ message: "ID do produto inválido." });

        const historico = await prisma.AuditoriaProduto.findMany({
            where: {
                id_produto: Number(id),
                id_tenant: req.tenantId 
            },
            include: {
                usuarios: { select: { nome_completo: true } }
            },
            orderBy: { data_alteracao: 'desc' }
        });
        res.json(historico);
    } catch (error) {
        console.error("Erro ao buscar auditoria:", error);
        res.status(500).json({ message: "Erro ao buscar histórico de auditoria." });
    }
};

export const getGlobalHistory = async (req, res, next) => {
    try {
        const auditoria = await prisma.AuditoriaProduto.findMany({
            where: { id_tenant: req.tenantId },
            take: 50,
            orderBy: { data_alteracao: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } },
                produtos: { select: { nome: true, imagem_url: true, id_produto: true } }
            }
        });

        const estoque = await prisma.movimentacaoEstoque.findMany({
            where: { produtos: { id_tenant: req.tenantId } }, 
            take: 50,
            orderBy: { data: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } },
                produtos: { select: { nome: true, imagem_url: true, id_produto: true } }
            }
        });

        const listaAuditoria = auditoria.map(log => ({
            id: `audit-${log.id_auditoria}`,
            tipo_evento: 'DADOS',
            data: log.data_alteracao,
            usuario: log.usuarios?.nome_completo || 'Sistema',
            produto: log.produtos,
            detalhes: {
                campo: log.campo_alterado,
                de: log.valor_antigo,
                para: log.valor_novo,
                acao: log.acao
            }
        }));

        const listaEstoque = estoque.map(mov => ({
            id: `stock-${mov.id_movimentacao}`,
            tipo_evento: 'ESTOQUE',
            data: mov.data,
            usuario: mov.usuarios?.nome_completo || 'Sistema',
            produto: mov.produtos,
            detalhes: {
                tipo: mov.tipo,
                qtd: mov.quantidade,
                saldo: mov.saldo_momento,
                motivo: mov.motivo,
                origem: mov.origem_destino
            }
        }));

        const timelineGlobal = [...listaAuditoria, ...listaEstoque]
            .sort((a, b) => new Date(b.data) - new Date(a.data));

        res.json(timelineGlobal);
    } catch (error) {
        console.error("Erro no histórico global:", error);
        res.status(500).json({ message: "Erro ao buscar auditoria global." });
    }
};

export const toggleProductEcommerce = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const produto = await Produto.findById(productId, req.tenantId);

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado' });

        const novoStatus = !produto.active_ecommerce;
        const produtoAtualizado = await Produto.toggleEcommerce(productId, novoStatus, req.tenantId);

        res.json({
            message: `Produto ${novoStatus ? 'ativado' : 'desativado'} no E-commerce`,
            active_ecommerce: novoStatus
        });
    } catch (error) {
        next(error);
    }
};

export const deleteProduto = async (req, res, next) => {
    const id_produto = Number(req.params.id);

    try {
        const produto = await prisma.produtos.findFirst({
            where: { id_produto, id_tenant: req.tenantId }
        });

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });

        const pauseMercadoLivre = async () => {
            if (produto.mercado_livre_id) {
                try {
                    const accessToken = await getValidAccessToken();
                    await axios.put(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}`,
                        { status: 'paused' },
                        { headers: { 'Authorization': `Bearer ${accessToken}` } }
                    );
                } catch (mlError) {
                    console.error("Aviso: Falha ao pausar no ML.", mlError.response?.data || mlError.message);
                }
            }
        };

        try {
            await prisma.produtos.delete({
                where: { id_produto }
            });
            await pauseMercadoLivre();
            return res.json({ message: 'Produto removido permanentemente.' });

        } catch (error) {
            if (error.code === 'P2003') {
                await prisma.produtos.update({
                    where: { id_produto },
                    data: {
                        ativo: false,
                        active_ecommerce: false,
                        ml_status: 'closed',
                        ifood_status: 'UNAVAILABLE'
                    }
                });
                await pauseMercadoLivre();
                return res.status(200).json({
                    message: 'O produto possui histórico e foi DESATIVADO.',
                    softDeleted: true
                });
            }
            throw error;
        }
    } catch (error) {
        next(error);
    }
};

export const publishToMercadoLivre = async (req, res, next) => {
    try {
        const { id: productId } = req.params;
        const produto = await Produto.findById(Number(productId), req.tenantId);

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });
        if (!produto.ml_category_id) return res.status(400).json({ message: 'Sem Categoria do Mercado Livre.' });

        const tituloAnuncio = produto.nome.substring(0, 60);
        const attributes = Array.isArray(produto.ml_attributes) ? produto.ml_attributes : [];
        const accessToken = await getValidAccessToken();

        let pictures = [];
        if (produto.imagem_url) pictures.push({ source: produto.imagem_url });
        if (produto.produto_subimagens && produto.produto_subimagens.length > 0) {
            const subPictures = produto.produto_subimagens.map(img => ({ source: img.url }));
            pictures = [...pictures, ...subPictures];
        }

        if (pictures.length === 0) return res.status(400).json({ message: 'Mínimo 1 imagem necessária.' });

        const anuncio = {
            title: tituloAnuncio,
            category_id: produto.ml_category_id,
            price: parseFloat(produto.preco),
            currency_id: "BRL",
            available_quantity: parseInt(produto.estoque),
            buying_mode: "buy_it_now",
            listing_type_id: "gold_special",
            condition: "new",
            description: { plain_text: produto.descricao },
            pictures: pictures,
            attributes: attributes,
            shipping: { mode: "me2" }
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
        }, req.tenantId);

        res.json({ message: 'Produto publicado com sucesso no ML!', url: data.permalink });
    } catch (error) {
        console.error("❌ Erro ao publicar no Mercado Livre:", error.response?.data || error.message);
        res.status(500).json({ message: 'Falha ao publicar no ML.' });
    }
};

export const updateMercadoLivreStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const produto = await Produto.findById(Number(req.params.id), req.tenantId);

        if (!produto || !produto.mercado_livre_id) return res.status(404).json({ message: 'Anúncio não encontrado.' });

        if (produto.ml_status === 'closed') {
            await Produto.update(produto.id_produto, { mercado_livre_id: null, ml_status: null }, req.tenantId);
            return res.json({ message: 'Anúncio estava fechado. Liberado para nova publicação.', reset: true });
        }

        const accessToken = await getValidAccessToken();

        try {
            const { data } = await axios.put(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}`,
                { status: status },
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            await Produto.update(produto.id_produto, { ml_status: data.status }, req.tenantId);
            res.json({ message: `Status atualizado para ${data.status}`, status: data.status });
        } catch (mlError) {
            const errorData = mlError.response?.data;
            const isNotFound = mlError.response && mlError.response.status === 404;
            const messageIsClosed = errorData && errorData.message && errorData.message.includes('status:closed');
            const causes = errorData?.cause || [];
            const isNotModifiable = causes.some(c =>
                c.code === 'item.title.not_modifiable' || c.code === 'item.price.not_modifiable' ||
                c.code === 'item.status.not_modifiable' || c.code === 'field_not_updatable'
            );

            if (isNotFound || messageIsClosed || isNotModifiable) {
                await Produto.update(produto.id_produto, { mercado_livre_id: null, ml_status: null }, req.tenantId);
                return res.json({ message: 'Anúncio irrecuperável. Liberado para nova publicação.', reset: true });
            }
            throw mlError;
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro ao comunicar com Mercado Livre.' });
    }
};

export const syncMercadoLivreStatus = async (req, res, next) => {
    try {
        const produto = await Produto.findById(Number(req.params.id), req.tenantId);

        if (!produto || !produto.mercado_livre_id) return res.status(404).json({ message: 'Não vinculado ao ML.' });

        const accessToken = await getValidAccessToken();

        try {
            const { data } = await axios.get(`https://api.mercadolibre.com/items/${produto.mercado_livre_id}?attributes=status`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            await Produto.update(produto.id_produto, { ml_status: data.status }, req.tenantId);
            res.json({ message: 'Status sincronizado!', status: data.status });
        } catch (mlError) {
            if (mlError.response && mlError.response.status === 404) {
                await Produto.update(produto.id_produto, { mercado_livre_id: null, ml_status: null }, req.tenantId);
                return res.json({ message: 'Removido do ML. Liberado para nova publicação.', status: null, reset: true });
            }
            throw mlError;
        }
    } catch (error) {
        res.status(500).json({ message: 'Não foi possível contatar o Mercado Livre.' });
    }
};

export const ajustarEstoqueManual = async (req, res, next) => {
    try {
        const { quantidade, tipo, motivo, origem_destino } = req.body;
        const productId = Number(req.params.id);

        if (!quantidade || !tipo || !motivo) return res.status(400).json({ message: "Dados incompletos." });

        const produtoAtualizado = await Produto.registrarMovimentacao({
            id_produto: productId,
            quantidade: Number(quantidade),
            tipo: tipo,
            motivo: motivo,
            origem_destino: origem_destino || "Ajuste Manual",
            usuario_id: req.user.id_usuario,
            id_tenant: req.tenantId 
        });

        try {
            await syncEstoqueIfoodAutomated(req.tenantId, productId, produtoAtualizado.estoque);
        } catch (err) {
            console.error("Erro ao sincronizar estoque com iFood no ajuste manual:", err);
        }

        res.status(200).json({
            message: "Estoque atualizado com sucesso!",
            novoEstoque: produtoAtualizado.estoque
        });
    } catch (error) {
        next(error);
    }
};

export const getProdutoRastreio = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const historico = await Produto.getRastreio(productId, req.tenantId);

        if (!historico) return res.status(404).json({ message: "Histórico não encontrado." });

        res.status(200).json(historico);
    } catch (error) {
        next(error);
    }
};