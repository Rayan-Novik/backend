import prisma from '../config/prisma.js';

// --- GET: Busca todas as configurações do rodapé ---
export const getFooterConfig = async (req, res) => {
    try {
        const links = await prisma.menus_rodape.findMany({
            where: { ativo: true },
            orderBy: { ordem: 'asc' }
        });

        // Agrupa os links por coluna
        const linksRapidos = links.filter(l => l.coluna === 'links_rapidos');
        const ajuda = links.filter(l => l.coluna === 'ajuda');

        // Busca o texto 'sobre' das configurações (se existir)
        const sobreConfig = await prisma.configuracoes.findUnique({
            where: { chave: 'FOOTER_SOBRE_TEXTO' }
        });

        res.json({
            linksRapidos,
            ajuda,
            sobreTexto: sobreConfig ? sobreConfig.valor : 'A sua loja de confiança para os melhores equipamentos.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar rodapé' });
    }
};

// --- ADMIN: Salvar Links ---
export const saveLink = async (req, res) => {
    const { titulo, url, coluna, ordem } = req.body;
    try {
        const newLink = await prisma.menus_rodape.create({
            data: { titulo, url, coluna, ordem: Number(ordem) }
        });
        res.status(201).json(newLink);
    } catch (error) {
        res.status(400).json({ message: 'Erro ao salvar link' });
    }
};

// --- ADMIN: Deletar Link ---
export const deleteLink = async (req, res) => {
    try {
        await prisma.menus_rodape.delete({ where: { id_link: Number(req.params.id) } });
        res.json({ message: 'Link removido' });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao remover link' });
    }
};

// --- ADMIN: Atualizar Texto Sobre ---
export const updateSobreTexto = async (req, res) => {
    const { texto } = req.body;
    try {
        await prisma.configuracoes.upsert({
            where: { chave: 'FOOTER_SOBRE_TEXTO' },
            update: { valor: texto },
            create: { chave: 'FOOTER_SOBRE_TEXTO', valor: texto }
        });
        res.json({ message: 'Texto atualizado' });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar texto' });
    }
};