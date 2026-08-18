import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🟢 1. LISTAR TODAS AS IMPRESSORAS
export const listarImpressoras = async (req, res, next) => {
    try {
        const impressoras = await prisma.impressoras.findMany({
            where: { id_tenant: req.tenantId, ativo: true },
            orderBy: { id_impressora: 'asc' }
        });
        res.status(200).json(impressoras);
    } catch (error) {
        next(error);
    }
};

// 🟢 2. CADASTRAR NOVA IMPRESSORA
export const criarImpressora = async (req, res, next) => {
    try {
        const { nome, tipo_conexao, endereco_ip, largura_papel, is_padrao } = req.body;
        const id_tenant = req.tenantId;

        // Se a nova impressora for marcada como padrão, tira o padrão das outras
        if (is_padrao) {
            await prisma.impressoras.updateMany({
                where: { id_tenant, is_padrao: true },
                data: { is_padrao: false }
            });
        }

        const novaImpressora = await prisma.impressoras.create({
            data: {
                id_tenant,
                nome,
                tipo_conexao,
                endereco_ip: endereco_ip || null,
                largura_papel: Number(largura_papel) || 80,
                is_padrao: Boolean(is_padrao)
            }
        });

        res.status(201).json({ message: "Impressora cadastrada!", impressora: novaImpressora });
    } catch (error) {
        next(error);
    }
};

// 🟢 3. REMOVER IMPRESSORA
export const removerImpressora = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        await prisma.impressoras.delete({
            where: { id_impressora: Number(id) }
        });

        res.status(200).json({ message: "Impressora removida com sucesso!" });
    } catch (error) {
        next(error);
    }
};

// 🟢 4. ROTEAMENTO: VINCULAR CATEGORIA À IMPRESSORA
// (Essa rota será chamada quando você mudar o select na aba de "Regras")
export const vincularCategoriaImpressora = async (req, res, next) => {
    try {
        const { id_categoria } = req.params;
        const { id_impressora } = req.body; // Se vier vazio, é para "desvincular"
        const id_tenant = req.tenantId;

        await prisma.categorias.updateMany({
            where: { 
                id_categoria: Number(id_categoria),
                id_tenant // Segurança para não alterar categoria de outra loja
            },
            data: { 
                id_impressora: id_impressora ? Number(id_impressora) : null 
            }
        });

        res.status(200).json({ message: "Regra de roteamento atualizada!" });
    } catch (error) {
        next(error);
    }
};