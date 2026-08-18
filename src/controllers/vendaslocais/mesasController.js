import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Lista todas as mesas da loja
export const listarMesas = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const mesas = await prisma.mesas.findMany({
            where: { id_tenant },
            orderBy: { nome: 'asc' }
        });
        res.json(mesas);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar mesas.", error: error.message });
    }
};

// Cria uma nova mesa
export const criarMesa = async (req, res) => {
    try {
        const { nome, status } = req.body;
        const id_tenant = req.tenantId;

        const novaMesa = await prisma.mesas.create({
            data: {
                nome,
                status: status || 'LIVRE',
                id_tenant
            }
        });
        res.status(201).json({ message: "Mesa criada com sucesso!", mesa: novaMesa });
    } catch (error) {
        res.status(400).json({ message: "Erro ao criar mesa.", error: error.message });
    }
};

// Atualiza uma mesa existente (Nome ou Status manual)
export const atualizarMesa = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, status } = req.body;
        const id_tenant = req.tenantId;

        const mesa = await prisma.mesas.updateMany({
            where: { id_mesa: Number(id), id_tenant },
            data: { nome, status }
        });

        if (mesa.count === 0) return res.status(404).json({ message: "Mesa não encontrada." });
        res.json({ message: "Mesa atualizada com sucesso!" });
    } catch (error) {
        res.status(400).json({ message: "Erro ao atualizar mesa.", error: error.message });
    }
};

// Exclui a mesa (apenas se estiver livre)
export const excluirMesa = async (req, res) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;

        const mesa = await prisma.mesas.findFirst({
            where: { id_mesa: Number(id), id_tenant }
        });

        if (!mesa) return res.status(404).json({ message: "Mesa não encontrada." });
        if (mesa.status !== 'LIVRE') {
            return res.status(400).json({ message: "Não é possível excluir uma mesa ocupada ou com comandas abertas." });
        }

        await prisma.mesas.delete({
            where: { id_mesa: Number(id) }
        });

        res.json({ message: "Mesa excluída com sucesso!" });
    } catch (error) {
        res.status(400).json({ message: "Erro ao excluir mesa.", error: error.message });
    }
};