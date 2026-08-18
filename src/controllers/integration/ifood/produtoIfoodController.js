import Produto from '../../../models/produtoModel.js';
import * as ifoodService from '../../../services/integration/ifoodService.js';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IFOOD_API_URL = 'https://merchant-api.ifood.com.br';

export const syncProdutoToIfood = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const tenantId = req.tenantId;

        const [produto, loja] = await Promise.all([
            prisma.produtos.findFirst({
                where: { id_produto: productId, id_tenant: tenantId },
                include: { categorias: true }
            }),
            prisma.lojas.findFirst({
                where: { id_tenant: tenantId, ativo: true }
            })
        ]);
        
        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });
        if (!produto.active_ecommerce) return res.status(400).json({ message: 'Ative o produto no e-commerce primeiro.' });

        const { catalogId, merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        const codigoPDV = produto.id_externo ? produto.id_externo.toString() : produto.id_produto.toString();

        let categoryUUID = produto.categorias?.ifood_id || null;
        const nomeCategoria = produto.categorias?.nome || 'Geral';
        const externalCatCode = produto.id_categoria ? `CAT-${produto.id_categoria}` : 'CAT-GERAL';

        if (!categoryUUID) {
            try {
                const catResponse = await axios.post(
                    `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
                    { name: nomeCategoria, status: "AVAILABLE", template: "DEFAULT", externalCode: externalCatCode },
                    { headers }
                );
                categoryUUID = catResponse.data.id;
                await prisma.categorias.update({
                    where: { id_categoria: produto.id_categoria },
                    data: { ifood_id: categoryUUID }
                });
            } catch (err) {
                if (err.response?.status === 409) {
                    const listCats = await axios.get(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/catalogs/${catalogId}/categories`, { headers });
                    categoryUUID = listCats.data.find(c => c.externalCode === externalCatCode)?.id;
                }
            }
        }

        if (!categoryUUID) return res.status(500).json({ message: "Falha ao resolver a categoria." });

        const shiftsInfo = {
            startTime: loja?.hora_abertura ? loja.hora_abertura.substring(0, 5) : "00:00",
            endTime: loja?.hora_fechamento ? loja.hora_fechamento.substring(0, 5) : "23:59",
            monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true
        };

        let precoFinalAtivo = Number(produto.preco);
        let precoOriginalApp = null; 

        if (req.query.promocao) {
            precoFinalAtivo = Number(req.query.promocao);
            precoOriginalApp = Number(produto.preco);
        } else if (req.query.removerPromo === 'true') {
            precoFinalAtivo = Number(produto.preco);
            precoOriginalApp = null;
        } else {
            if (produto.preco_ifood && Number(produto.preco_ifood) < Number(produto.preco)) {
                precoFinalAtivo = Number(produto.preco_ifood);
                precoOriginalApp = Number(produto.preco);
            } else {
                precoFinalAtivo = produto.preco_ifood ? Number(produto.preco_ifood) : Number(produto.preco);
            }
        }

        let priceObject = {
            value: precoFinalAtivo,
            currency: "BRL"
        };
        
        if (precoOriginalApp) {
            priceObject.originalValue = precoOriginalApp;
        }

        let base64ComPrefixo = undefined;
        if (produto.imagem_url && produto.imagem_url.trim() !== '') {
            try {
                let imageUrl = produto.imagem_url.trim();
                if (imageUrl.includes('cloudinary.com')) {
                    const partes = imageUrl.split('/upload/');
                    if (partes.length === 2) {
                        let caminho = partes[1];
                        if (caminho.includes('/') && !caminho.split('/')[0].startsWith('v')) {
                            caminho = caminho.substring(caminho.indexOf('/') + 1);
                        }
                        imageUrl = `${partes[0]}/upload/c_pad,w_400,h_400,b_white,f_jpg,q_80/${caminho}`;
                    }
                }
                const imageDownload = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 8000 });
                const base64Puro = Buffer.from(imageDownload.data).toString('base64').replace(/[^A-Za-z0-9+/=]/g, "");
                base64ComPrefixo = `data:image/jpeg;base64,${base64Puro}`;
            } catch (errImg) {
                console.warn(`[Aviso] Não foi possível baixar a imagem do produto ${produto.id_produto} durante o sync.`);
            }
        }

        // 🟢 MONTAGEM DOS DADOS PARA O IFOOD
        const entityPayload = {
            name: produto.nome.substring(0, 100).trim(),
            externalCode: codigoPDV,
            serving: produto.ifood_serving || "NOT_APPLICABLE"
        };

        if (produto.descricao && produto.descricao.trim() !== '') {
            entityPayload.description = produto.descricao.substring(0, 500).trim();
        }

        // 🟢 TRADUTOR DE RESTRIÇÕES ALIMENTARES
        if (produto.ifood_restricoes && produto.ifood_restricoes.trim() !== '') {
            const allowedRestrictions = ['VEGETARIAN', 'VEGAN', 'ORGANIC', 'GLUTEN_FREE', 'SUGAR_FREE', 'LAC_FREE', 'ALCOHOLIC_DRINK', 'NATURAL', 'ZERO', 'DIET'];
            const rawRestrictions = produto.ifood_restricoes.split(',');
            const validRestrictions = [];
            
            for (let r of rawRestrictions) {
                r = r.trim().toUpperCase();
                // Traduzindo as nossas tags para as oficiais do iFood
                if (r === 'LACTOSE_FREE') r = 'LAC_FREE';
                if (r === 'ALCOHOLIC') r = 'ALCOHOLIC_DRINK';
                
                // Se a tag existe no dicionário deles, nós enviamos. (Ignora tags não suportadas como COLD_DRINK)
                if (allowedRestrictions.includes(r)) {
                    validRestrictions.push(r);
                }
            }

            if (validRestrictions.length > 0) {
                entityPayload.dietaryRestrictions = validRestrictions;
            }
        }

        // 🟢 TRADUTOR DE PESO E VOLUME
        if (produto.peso && produto.unidade) {
            const unitNormalizada = produto.unidade.toLowerCase();
            
            if (unitNormalizada === 'g' || unitNormalizada === 'kg') {
                entityPayload.weight = {
                    quantity: Number(produto.peso),
                    unit: unitNormalizada === 'kg' ? 'Kg' : 'g' // iFood exige "Kg" ou "g"
                };
            } else if (unitNormalizada === 'ml' || unitNormalizada === 'l') {
                entityPayload.volume = {
                    quantity: Number(produto.peso),
                    unit: unitNormalizada === 'l' ? 'L' : 'ml' // Se for líquido, vai em "volume"
                };
            }
        }

        if (base64ComPrefixo) {
            entityPayload.image = base64ComPrefixo;
        }

        let ifoodItemId = produto.ifood_id;

        if (ifoodItemId) {
            await axios.put(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/${ifoodItemId}`, entityPayload, { headers });
        } else {
            const { data } = await axios.post(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products`, entityPayload, { headers });
            ifoodItemId = data.id;
        }

        const estoqueReal = Number(produto.estoque);
        const statusEstoque = estoqueReal > 0 ? "AVAILABLE" : "UNAVAILABLE";

        const linkPayload = {
            status: statusEstoque,
            price: priceObject,
            externalCode: codigoPDV,
            shifts: [shiftsInfo]
        };

        try {
            await axios.post(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/categories/${categoryUUID}/products/${ifoodItemId}`, linkPayload, { headers });
        } catch (linkError) {
            if (linkError.response?.status === 409) {
                await axios.patch(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/categories/${categoryUUID}/products/${ifoodItemId}`, linkPayload, { headers });
            }
        }

        try {
            await axios.patch(
                `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/price`,
                [{ productId: ifoodItemId, price: priceObject }],
                { headers }
            );
        } catch (priceErr) {
            console.error("⚠️ Erro ao forçar o preço:", priceErr.response?.data || priceErr.message);
        }

        try {
            await axios.post(
                `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/inventory`,
                {
                    productId: ifoodItemId,
                    amount: estoqueReal > 0 ? estoqueReal : 0,
                    inStock: estoqueReal > 0
                },
                { headers }
            );
        } catch (invErr) {
            console.error("⚠️ Erro ao enviar NÚMERO do estoque:", invErr.response?.data || invErr.message);
        }

        await prisma.produtos.update({
            where: { id_produto: productId },
            data: { 
                ifood_id: ifoodItemId, 
                ifood_status: statusEstoque, 
                preco_ifood: precoFinalAtivo 
            }
        });

        res.status(200).json({ message: 'Sincronizado!', ifood_id: ifoodItemId });

    } catch (error) {
        console.error("❌ Erro Detalhado iFood:", JSON.stringify(error.response?.data, null, 2));
        res.status(500).json({ message: 'Erro ao sincronizar', details: error.response?.data?.error?.details || error.message });
    }
};

export const syncEstoqueIfoodAutomated = async (tenantId, productId, quantidadeAtual) => {
    try {
        const produto = await prisma.produtos.findFirst({
            where: { id_produto: Number(productId), id_tenant: tenantId }
        });

        if (!produto || !produto.ifood_id) return; 

        const estoqueReal = Number(quantidadeAtual);
        const novoStatus = estoqueReal > 0 ? 'AVAILABLE' : 'UNAVAILABLE';

        const { merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        // 1. Atualiza o status visual (Pausar/Despausar) caso precise
        if (produto.ifood_status !== novoStatus) {
            await axios.patch(
                `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/${produto.ifood_id}/status`,
                { status: novoStatus },
                { headers }
            ).catch(() => {});
        }

        // 2. 🟢 MÁGICA: Manda o número exato para a caixinha do iFood que você mostrou no print!
        await axios.post(
            `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/inventory`,
            {
                productId: produto.ifood_id,
                amount: estoqueReal > 0 ? estoqueReal : 0,
                inStock: estoqueReal > 0
            },
            { headers }
        );

        // 3. Atualiza o banco local
        await prisma.produtos.update({
            where: { id_produto: Number(productId) },
            data: { ifood_status: novoStatus }
        });

        console.log(`[iFood Estoque] O produto ${produto.nome} foi atualizado para ${estoqueReal} unidades na vitrine do iFood!`);
    } catch (error) {
        console.error(`[iFood Estoque] Erro ao sincronizar:`, error.response?.data || error.message);
    }
};

export const syncFotoIfood = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const tenantId = req.tenantId;

        const produto = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId }
        });

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });
        if (!produto.ifood_id) return res.status(400).json({ message: 'O produto precisa ser sincronizado primeiro antes de enviar a foto.' });
        if (!produto.imagem_url || produto.imagem_url.trim() === '') return res.status(400).json({ message: 'Produto sem imagem cadastrada.' });

        const { merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        const codigoPDV = produto.id_externo ? produto.id_externo.toString() : produto.id_produto.toString();

        let imageUrl = produto.imagem_url.trim();
        
        if (imageUrl.includes('cloudinary.com')) {
            const partes = imageUrl.split('/upload/');
            if (partes.length === 2) {
                let caminho = partes[1];
                if (caminho.includes('/') && !caminho.split('/')[0].startsWith('v')) {
                    caminho = caminho.substring(caminho.indexOf('/') + 1);
                }
                imageUrl = `${partes[0]}/upload/c_pad,w_400,h_400,b_white,f_jpg,q_80/${caminho}`;
            }
        }

        const imageDownload = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const base64Puro = Buffer.from(imageDownload.data).toString('base64').replace(/[^A-Za-z0-9+/=]/g, "");
        const base64ComPrefixo = `data:image/jpeg;base64,${base64Puro}`;

        const payloadCompleto = {
            name: produto.nome.substring(0, 100).trim(),
            externalCode: codigoPDV,
            serving: produto.ifood_serving || "NOT_APPLICABLE",
            image: base64ComPrefixo 
        };

        if (produto.descricao && produto.descricao.trim() !== '') {
            payloadCompleto.description = produto.descricao.substring(0, 500).trim();
        }

        await axios.put(
            `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/${produto.ifood_id}`,
            payloadCompleto,
            { headers }
        );

        res.status(200).json({ message: 'Foto enviada e vinculada com sucesso no iFood!' });

    } catch (error) {
        console.error("❌ Erro ao enviar FOTO pro iFood:", JSON.stringify(error.response?.data, null, 2));
        res.status(500).json({ message: 'Erro ao enviar a foto', details: error.response?.data?.error?.details || error.message });
    }
};

export const updateIfoodStatus = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const { status } = req.body; 
        const tenantId = req.tenantId;

        const produto = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId }
        });
        
        if (!produto || !produto.ifood_id) return res.status(404).json({ message: 'Não vinculado ao iFood.' });

        const { merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        
        // 🟢 O ERRO ESTAVA AQUI! Faltava a rota "/status" no final da URL
        await axios.patch(
            `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/${produto.ifood_id}/status`,
            { status: status },
            { headers }
        );

        await prisma.produtos.update({
            where: { id_produto: productId },
            data: { ifood_status: status }
        });

        res.status(200).json({ message: `Status alterado para ${status}` });
    } catch (error) {
        console.error("Erro Status iFood:", error.response?.data || error.message);
        next(error); // Isso repassa o erro para o middleware de erro do Express
    }
};

// ==============================================================================
// 🍔 A LÓGICA DO COMBO DEFINITIVA E BLINDADA
// ==============================================================================

export const syncComboIfood = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const tenantId = req.tenantId;
        const gruposEnviados = req.body.grupos; 

        const produtoCombo = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId }
        });

        if (!produtoCombo) return res.status(404).json({ message: 'Produto principal não encontrado.' });
        if (!produtoCombo.ifood_id) return res.status(400).json({ message: 'Publique o produto base (Combo) no iFood primeiro.' });
        if (!gruposEnviados || gruposEnviados.length === 0) return res.status(400).json({ message: 'Nenhum grupo foi enviado.' });

        const { merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        console.log(`Montando Combo: ${produtoCombo.nome}`);

        // ==========================================
        // 🟢 PASSO 1: LIMPEZA TRIPLA NO IFOOD (MATA-FANTASMA)
        // ==========================================
        const comboAntigo = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId },
            include: { grupos_complemento: true }
        });

        if (comboAntigo && comboAntigo.grupos_complemento.length > 0) {
            console.log("Executando limpeza profunda dos grupos antigos no iFood...");
            for (const grupoVelho of comboAntigo.grupos_complemento) {
                if (grupoVelho.ifood_id) {
                    // 1. Oculta o grupo velho imediatamente
                    await axios.patch(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${grupoVelho.ifood_id}`, { status: "UNAVAILABLE" }, { headers }).catch(()=>{});
                    
                    // 2. Arranca o vínculo do grupo com o Produto Base
                    await axios.delete(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${grupoVelho.ifood_id}/products/${produtoCombo.ifood_id}`, { headers }).catch(()=>{});
                    
                    // 3. Destrói o grupo velho da existência do catálogo
                    await axios.delete(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${grupoVelho.ifood_id}`, { headers }).catch(()=>{});
                }
            }
        }

        // ==========================================
        // 🟢 PASSO 2: RENOVAR O BANCO DE DADOS LOCAL
        // ==========================================
        await prisma.produto_grupos_complemento.deleteMany({ where: { id_produto: productId } });

        for (const g of gruposEnviados) {
            const grupoCriado = await prisma.produto_grupos_complemento.create({
                data: {
                    id_produto: productId,
                    id_tenant: tenantId,
                    nome: g.nome,
                    minimo: Number(g.minimo),
                    maximo: Number(g.maximo),
                    tipo_grupo: g.tipo_grupo || 'CHOICE' // 🟢 SALVA O TIPO NO BANCO
                }
            });

            for (const c of g.complementos) {
                if (!c.id_produto_add) continue; 
                
                await prisma.produto_complementos.create({
                    data: {
                        id_grupo: grupoCriado.id_grupo,
                        id_produto_add: Number(c.id_produto_add),
                        preco_adicional: Number(c.preco_adicional) || 0
                    }
                });
            }
        }

        // ==========================================
        // 🟢 PASSO 3: RECRIAR LIMPO NO IFOOD
        // ==========================================
        const produtoComCombos = await prisma.produtos.findFirst({
            where: { id_produto: productId },
            include: {
                grupos_complemento: {
                    include: { complementos: { include: { produto_add: true } } }
                }
            }
        });

        let indexOrdem = 0;

        for (const grupo of produtoComCombos.grupos_complemento) {
            
            // ETAPA A: CRIAR O GRUPO VAZIO
            const grupoPayload = {
                name: grupo.nome,
                min: grupo.minimo,
                max: grupo.maximo,
                status: "AVAILABLE",
                optionGroupType: grupo.tipo_grupo || "CHOICE", // 🟢 MANDA O TIPO PARA O IFOOD
                externalCode: `GRP-${grupo.id_grupo}`
            };

            const grupoRes = await axios.post(`${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups`, grupoPayload, { headers });
            const optionGroupId = grupoRes.data.id;
            
            await prisma.produto_grupos_complemento.update({
                where: { id_grupo: grupo.id_grupo },
                data: { ifood_id: optionGroupId }
            });

            // ETAPA B: COLOCAR AS OPÇÕES DENTRO DO GRUPO (Com /option no final)
            let indexOpcao = 0;
            for (const item of grupo.complementos) {
                if (!item.produto_add.ifood_id) {
                    console.warn(`O item ${item.produto_add.nome} não tem ifood_id. Publique ele no iFood primeiro.`);
                    continue; 
                }

                const optionPayload = {
                    status: "AVAILABLE",
                    index: indexOpcao++,
                    price: {
                        value: Number(item.preco_adicional) || 0,
                        currency: "BRL"
                    },
                    externalCode: `OPT-${item.id_complemento}`
                };

                try {
                    // A rota correta para adicionar uma OPÇÃO
                    await axios.post(
                        `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${optionGroupId}/products/${item.produto_add.ifood_id}/option`, 
                        optionPayload, 
                        { headers }
                    );
                } catch (optErr) {
                    if (optErr.response?.status === 409) {
                        await axios.patch(
                            `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${optionGroupId}/products/${item.produto_add.ifood_id}/option`, 
                            optionPayload, 
                            { headers }
                        );
                    } else {
                        console.error(`Erro na opção ${item.produto_add.nome}:`, optErr.response?.data);
                    }
                }
            }

            // 🟢 ETAPA C: VINCULAR O GRUPO FINALIZADO AO COMBO
            const linkGroupPayload = {
                min: Number(grupo.minimo) >= 0 ? Number(grupo.minimo) : 0,
                max: Number(grupo.maximo) >= 1 ? Number(grupo.maximo) : 1,
                status: "AVAILABLE",
                index: indexOrdem++
            };
            
            try {
                // 🟢 A URL CORRETA PARA VINCULAR (optionGroups/ID/products/ID)
                await axios.post(
                    `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${optionGroupId}/products/${produtoCombo.ifood_id}`,
                    linkGroupPayload,
                    { headers }
                );
            } catch (linkErr) {
                if (linkErr.response?.status === 409) {
                    await axios.patch(
                        `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/optionGroups/${optionGroupId}/products/${produtoCombo.ifood_id}`,
                        linkGroupPayload,
                        { headers }
                    );
                } else {
                    console.error("Erro ao vincular grupo no Combo:", linkErr.response?.data);
                }
            }
        }

        res.status(200).json({ message: 'Combo e opções sincronizados com sucesso!' });

    } catch (error) {
        console.error("❌ Erro ao sincronizar Combo:", JSON.stringify(error.response?.data || error.message, null, 2));
        res.status(500).json({ message: 'Erro ao processar os complementos', details: error.message });
    }
};

// 🍔 SERVIÇO 4: BUSCAR O COMBO EXISTENTE
export const getComboIfood = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const tenantId = req.tenantId;

        const produtoComCombos = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId },
            include: {
                grupos_complemento: {
                    include: { complementos: true }
                }
            }
        });

        if (!produtoComCombos) return res.status(404).json({ message: 'Produto não encontrado.' });

        res.status(200).json(produtoComCombos.grupos_complemento);
    } catch (error) {
        console.error("Erro ao buscar combo:", error);
        res.status(500).json({ message: 'Erro ao buscar dados do combo.' });
    }
};

// 🍔 SERVIÇO 5: DELETAR O COMBO INTEIRO
export const deleteComboIfood = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        const tenantId = req.tenantId;

        const produtoCombo = await prisma.produtos.findFirst({
            where: { id_produto: productId, id_tenant: tenantId },
            include: { grupos_complemento: true }
        });

        if (!produtoCombo || !produtoCombo.ifood_id) return res.status(400).json({ message: 'Produto não vinculado.' });

        const { merchantId, token } = await ifoodService.getMerchantCatalog(tenantId);
        const headers = { Authorization: `Bearer ${token}` };

        // 1. Desvincula os grupos lá no iFood
        for (const grupo of produtoCombo.grupos_complemento) {
            if (grupo.ifood_id) {
                try {
                    // A rota para deletar o vínculo do grupo no produto
                    await axios.delete(
                        `${IFOOD_API_URL}/catalog/v1.0/merchants/${merchantId}/products/${produtoCombo.ifood_id}/optionGroups/${grupo.ifood_id}`,
                        { headers }
                    );
                } catch (err) {
                    console.error(`Erro ao desvincular grupo ${grupo.ifood_id}:`, err.response?.data || err.message);
                }
            }
        }

        // 2. Apaga do seu banco de dados
        await prisma.produto_grupos_complemento.deleteMany({
            where: { id_produto: productId }
        });

        res.status(200).json({ message: 'Combo removido com sucesso!' });
    } catch (error) {
        console.error("Erro ao deletar combo:", error);
        res.status(500).json({ message: 'Erro ao remover combo.' });
    }
};

