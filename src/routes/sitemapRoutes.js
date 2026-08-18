import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// Como vamos chamar isso de fora, a rota interna é só '/'
router.get('/', async (req, res) => {
  try {
    const host = req.get('host');

    // Busca o lojista pelo domínio
    // ⚠️ Confirme se a sua coluna no Prisma chama 'dominio_customizado'
    const tenant = await prisma.tenants.findFirst({
      where: { dominio_customizado: host }
    });

    if (!tenant) {
      return res.status(404).send('Loja não encontrada');
    }

    // Busca os produtos desse tenant
    // ⚠️ Confirme se a coluna de relação chama 'tenantId' e se 'ativo' existe
    const produtos = await prisma.produtos.findMany({
      where: { 
        tenantId: tenant.id,
        ativo: true 
      }
    });

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Rota Principal da Loja
    xml += `  <url>\n`;
    xml += `    <loc>https://${host}/</loc>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>1.0</priority>\n`;
    xml += `  </url>\n`;

    // Rotas dos Produtos
    produtos.forEach((produto) => {
      xml += `  <url>\n`;
      // ⚠️ Ajuste '/produto/' se a sua URL no frontend for diferente (ex: '/p/')
      xml += `    <loc>https://${host}/produto/${produto.id_produto}</loc>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);

  } catch (error) {
    console.error("Erro ao gerar sitemap dinâmico:", error);
    res.status(500).send('Erro interno do servidor');
  }
});

export default router;