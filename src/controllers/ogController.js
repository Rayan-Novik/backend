import { PrismaClient } from '@prisma/client';
import ConfiguracaoModel from '../models/configuracaoModel.js'; // Certifique-se de importar o model!

const prisma = new PrismaClient();

export const renderOgTags = async (req, res) => {
    try {
        console.log("🤖 ALGUÉM BATEU NA ROTA OG! User-Agent:", req.headers['user-agent']);

        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const slug = host.replace('.ararinhacloud.shop', '').replace(/^www\./, '');

        // 1. Busca a loja pelo slug
        const loja = await prisma.tenants.findUnique({ 
            where: { slug: slug } 
        });

        if (!loja) {
            return res.status(404).json({ error: "Loja não encontrada ou inativa." });
        }

        // 2. Busca usando o ConfiguracaoModel (para manter o mesmo padrão e descompactação do resto do sistema)
        const logoUrlConfig = await ConfiguracaoModel.get('LOGO_URL', loja.id);
        const siteTitleConfig = await ConfiguracaoModel.get('SITE_TITLE', loja.id);

        const siteTitle = siteTitleConfig || loja.nome_fantasia || 'Loja';
        
        // 3. Verifica e formata a imagem para ser um LINK ABSOLUTO sempre
        let logoUrl = logoUrlConfig;
        if (logoUrl && !logoUrl.startsWith('http')) {
            // Se a logo for salva como caminho relativo (ex: /uploads/logo.png), transforma em absoluto
            logoUrl = `https://${host}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
        }

        const titulo = siteTitle;
        // Se não tiver logo válida, cai pro banner padrão
        const imagem = logoUrl || 'https://back.ararinhacloud.shop/images/banner-padrao.png'; 
        const descricao = `Acesse a loja ${siteTitle} e confira nossos produtos!`;

        const htmlLeve = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${titulo}</title>
                
                <meta property="og:type" content="website" />
                <meta property="og:title" content="${titulo}" />
                <meta property="og:description" content="${descricao}" />
                
                <!-- Aqui o WhatsApp pega a imagem -->
                <meta property="og:image" itemprop="image" content="${imagem}" />
                <meta property="og:image:secure_url" itemprop="image" content="${imagem}" />
                <meta property="og:image:type" content="image/png" />
                <!-- Recomenda-se remover o width/height fixo se a logo não for exatamente 1200x630, 
                     pois o WhatsApp pode bugar se as dimensões forem falsas -->
                
                <meta property="og:url" content="https://${host}/" />
                <meta property="og:site_name" content="${titulo}" />

                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="${titulo}" />
                <meta name="twitter:description" content="${descricao}" />
                <meta name="twitter:image" content="${imagem}" />
            </head>
            <body>
                <h1>${titulo}</h1>
                <p>${descricao}</p>
                <img src="${imagem}" alt="Banner da loja">
            </body>
            </html>
        `;

        return res.send(htmlLeve);

    } catch (error) {
        console.error("Erro ao gerar OG Tags:", error);
        res.status(500).send("Erro interno ao processar o link");
    }
};