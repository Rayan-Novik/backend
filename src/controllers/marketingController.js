import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Criar nova campanha com imagem
export const createMarketingCampaign = async (req, res) => {
    try {
        const { nome, slug, cor_tema, ids_produtos, data_inicio, data_fim, descricao, imagem_url } = req.body;

        if (!data_inicio || !data_fim || isNaN(new Date(data_inicio)) || isNaN(new Date(data_fim))) {
            return res.status(400).json({ error: "Por favor, selecione datas de início e fim válidas." });
        }

        const listaProdutos = ids_produtos || [];

        const campanha = await prisma.campanhas_marketing.create({
            data: {
                nome,
                slug,
                descricao: descricao || '',
                cor_tema: cor_tema || '#0d6efd',
                imagem_url: imagem_url || '',
                data_inicio: new Date(data_inicio),
                data_fim: new Date(data_fim),
                campanha_marketing_produtos: {
                    create: listaProdutos.map(id => ({
                        id_produto: Number(id)
                    }))
                }
            }
        });

        res.status(201).json(campanha);
    } catch (error) {
        console.error("Erro ao criar campanha:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// Deletar campanha
export const deleteMarketingCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.campanha_marketing_produtos.deleteMany({ where: { id_campanha: Number(id) } });
        await prisma.campanhas_marketing.delete({ where: { id_campanha: Number(id) } });
        res.json({ message: "Campanha excluída com sucesso" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Registrar clique (Analytics público)
export const trackCampaignClick = async (req, res) => {
    try {
        const { slug } = req.params;
        await prisma.campanhas_marketing.update({
            where: { slug },
            data: { cliques: { increment: 1 } }
        });
        res.json({ message: "Clique registrado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Listar todas (Painel Admin)
export const getMarketingCampaigns = async (req, res) => {
    try {
        const campanhas = await prisma.campanhas_marketing.findMany({
            include: {
                campanha_marketing_produtos: {
                    include: { produtos: true }
                }
            },
            orderBy: { id_campanha: 'desc' }
        });
        res.json(campanhas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Listar apenas as que estão no prazo (Site Público)
export const getActiveCampaigns = async (req, res) => {
    try {
        const agora = new Date();
        const campanhas = await prisma.campanhas_marketing.findMany({
            where: {
                ativo: true,
                data_inicio: { lte: agora },
                data_fim: { gte: agora }
            },
            orderBy: { data_inicio: 'desc' }
        });
        res.json(campanhas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Buscar detalhes por Slug
export const getCampaignBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const campanha = await prisma.campanhas_marketing.findUnique({
            where: { slug },
            include: {
                campanha_marketing_produtos: {
                    include: { produtos: true }
                }
            }
        });
        if (!campanha) return res.status(404).json({ message: "Campanha não encontrada" });
        res.json(campanha);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * ✅ FEED DE PRODUTOS PARA FACEBOOK ADS (CATÁLOGO)
 * Este endpoint gera o XML que o Facebook lê para criar anúncios automáticos.
 */
export const getFacebookProductFeed = async (req, res) => {
    try {
        const produtos = await prisma.produtos.findMany({
            where: { ativo: true }
        });

        const baseUrl = process.env.FRONTEND_URL || "https://ecommercerpool.shop";

        // 1. Início do XML sem espaços ou quebras de linha antes do cabeçalho
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
    <title>Catálogo de Produtos - Minha Loja</title>
    <link>${baseUrl}</link>
    <description>Feed dinâmico de produtos para Facebook e Instagram Ads</description>`;

        produtos.forEach(p => {
            // Limpeza rigorosa para evitar quebra de XML
            const cleanName = p.nome.replace(/[&<>"']/g, "").trim();
            const cleanDesc = (p.descricao || "Confira este produto incrível!")
                .replace(/[&<>"']/g, "")
                .replace(/\n/g, " ")
                .substring(0, 150)
                .trim();
            
            // Determinar categoria aproximada (Melhora a aceitação do Face)
            const category = cleanName.toLowerCase().includes("notebook") || cleanName.toLowerCase().includes("iphone") 
                ? "Electronics > Computers" 
                : "Home &amp; Garden";

            xml += `
    <item>
        <g:id>prod_${p.id_produto}</g:id>
        <g:title>${cleanName}</g:title>
        <g:description>${cleanDesc}</g:description>
        <g:link>${baseUrl}/produto/${p.id_produto}</g:link>
        <g:image_link>${p.imagem_url || ''}</g:image_link>
        <g:condition>new</g:condition>
        <g:availability>in stock</g:availability>
        <g:price>${Number(p.preco).toFixed(2)} BRL</g:price>
        <g:brand>PoolShop</g:brand>
        <g:google_product_category>${category}</g:google_product_category>
    </item>`;
        });

        xml += `
</channel>
</rss>`;

        // 2. CONFIGURAÇÃO CRÍTICA DE HEADERS
        // Remove qualquer caractere invisível antes do XML
        const output = xml.trim();
        
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.status(200).send(output);

    } catch (error) {
        console.error("Erro no Feed do Facebook:", error.message);
        res.status(500).send("Erro ao gerar feed");
    }
};

export const postarNoFeed = async (req, res) => {
    try {
        const { id } = req.params;
        const produto = await prisma.produtos.findUnique({ where: { id_produto: Number(id) } });

        const mensagem = `${produto.nome}\n🔥 Confira agora: https://ecommercerpool.shop/produto/${id}`;
        
        const response = await axios.post(`https://graph.facebook.com/v18.0/ID_DA_SUA_PAGINA/feed`, {
            message: mensagem,
            link: produto.imagem_url,
            access_token: process.env.FB_PAGE_TOKEN
        });

        res.json({ success: true, message: "Postado no Feed!", id: response.data.id });
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
};

// OPÇÃO B: ANÚNCIO PAGO (Exemplo Simplificado de Marketing API)
export const criarCampanhaPaga = async (req, res) => {
    try {
        const { id } = req.params;
        // 1. Criar Campaign -> 2. Criar AdSet (Público/Orçamento) -> 3. Criar Ad (Criativo)
        // O Facebook exige vários passos, mas o gatilho inicial é este:
        const adAccount = `act_${process.env.FB_AD_ACCOUNT_ID}`;
        
        const campaign = await axios.post(`https://graph.facebook.com/v18.0/${adAccount}/campaigns`, {
            name: `Anúncio Automático - Produto ${id}`,
            objective: 'OUTCOME_SALES',
            status: 'PAUSED', // Começa pausado para você revisar se quiser
            special_ad_categories: 'NONE',
            access_token: process.env.FB_USER_TOKEN
        });

        res.json({ success: true, campaign_id: campaign.data.id });
    } catch (error) {
        res.status(500).json({ error: "Erro na Marketing API" });
    }
};