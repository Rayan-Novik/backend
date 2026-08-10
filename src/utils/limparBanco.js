import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function limpar() {
    console.log("🧹 Iniciando limpeza PROFUNDA...");

    try {
        // 1. Remove LIDs explícitos
        const deletedLid = await prisma.whatsappMensagens.deleteMany({
            where: { remoteJid: { contains: '@lid' } }
        });
        console.log(`✅ Removidos ${deletedLid.count} LIDs (@lid).`);

        // 2. Remove Status/Broadcast
        const deletedBroadcast = await prisma.whatsappMensagens.deleteMany({
            where: { remoteJid: 'status@broadcast' }
        });
        console.log(`✅ Removidos ${deletedBroadcast.count} Broadcasts.`);

        // 3. 🔥 NOVO: Remove números inválidos que começam com 127 (LIDs mascarados)
        const deletedBadNumbers = await prisma.whatsappMensagens.deleteMany({
            where: { remoteJid: { startsWith: '127' } }
        });
        console.log(`✅ Removidos ${deletedBadNumbers.count} números inválidos (começando com 127).`);

    } catch (error) {
        console.error("❌ Erro ao limpar:", error);
    } finally {
        await prisma.$disconnect();
    }
}

limpar();