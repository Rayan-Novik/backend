import prisma from '../config/prisma.js';

export const getFooterConfig = async (req, res) => {
    try {
        const links = await prisma.menus_rodape.findMany({
            where: { 
                ativo: true,
                id_tenant: req.tenantId
            },
            orderBy: { ordem: 'asc' }
        });

        const linksRapidos = links.filter(l => l.coluna === 'links_rapidos');
        const ajuda = links.filter(l => l.coluna === 'ajuda');

        const sobreConfig = await prisma.configuracoes.findFirst({
            where: { 
                chave: 'FOOTER_SOBRE_TEXTO',
                id_tenant: req.tenantId
            }
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

export const saveLink = async (req, res) => {
    const { titulo, url, coluna, ordem } = req.body;
    try {
        const newLink = await prisma.menus_rodape.create({
            data: { 
                titulo, 
                url, 
                coluna, 
                ordem: Number(ordem),
                id_tenant: req.tenantId
            }
        });
        res.status(201).json(newLink);
    } catch (error) {
        res.status(400).json({ message: 'Erro ao salvar link' });
    }
};

export const deleteLink = async (req, res) => {
    try {
        await prisma.menus_rodape.deleteMany({ 
            where: { 
                id_link: Number(req.params.id),
                id_tenant: req.tenantId
            } 
        });
        res.json({ message: 'Link removido' });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao remover link' });
    }
};

export const updateSobreTexto = async (req, res) => {
    const { texto } = req.body;
    try {
        const existing = await prisma.configuracoes.findFirst({
            where: { 
                chave: 'FOOTER_SOBRE_TEXTO',
                id_tenant: req.tenantId
            }
        });

        if (existing) {
            await prisma.configuracoes.updateMany({
                where: { 
                    chave: 'FOOTER_SOBRE_TEXTO',
                    id_tenant: req.tenantId
                },
                data: { valor: texto }
            });
        } else {
            await prisma.configuracoes.create({
                data: { 
                    chave: 'FOOTER_SOBRE_TEXTO', 
                    valor: texto,
                    id_tenant: req.tenantId
                }
            });
        }
        
        res.json({ message: 'Texto atualizado' });
    } catch (error) {
        res.status(400).json({ message: 'Erro ao atualizar texto' });
    }
};