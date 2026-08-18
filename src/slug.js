import { PrismaClient } from '@prisma/client';
import * as slugifyModule from 'slugify'; // 🟢 Importação robusta
const slugify = slugifyModule.default || slugifyModule;
import 'dotenv/config';

const prisma = new PrismaClient();

const inicializarSlugs = async () => {
    console.log("🔍 Verificando produtos sem slug...");

    try {
        const produtosSemSlug = await prisma.produtos.findMany({
            where: {
                OR: [
                    { slug: null },
                    { slug: '' }
                ]
            }
        });

        if (produtosSemSlug.length === 0) {
            console.log("✅ Todos os produtos já possuem slugs.");
            return;
        }

        console.log(`⚠️ Encontrados ${produtosSemSlug.length} produtos sem slug. Corrigindo...`);

        for (const produto of produtosSemSlug) {
            // Gera o slug com a função agora definida corretamente
            const baseSlug = slugify(produto.nome, { lower: true, strict: true, locale: 'pt' });
            const slugFinal = `${baseSlug}-${produto.id_produto}`;

            await prisma.produtos.update({
                where: { id_produto: produto.id_produto },
                data: { slug: slugFinal }
            });
            console.log(`✅ Slug gerado para: ${produto.nome} -> ${slugFinal}`);
        }

        console.log("🚀 Todos os slugs pendentes foram preenchidos com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao inicializar slugs:", error);
    }
};

const startServer = async () => {
    await inicializarSlugs(); 
    console.log("Servidor rodando...");
};

startServer();