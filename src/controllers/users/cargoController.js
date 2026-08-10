import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSION_KEYS } from '../../utils/permissions.js';

const prisma = new PrismaClient();

export const getAllCargos = async (req, res, next) => {
    try {
        const cargos = await prisma.cargos.findMany({
            where: { id_tenant: req.tenantId },
            include: {
                _count: { select: { funcionarios: true } }
            },
            orderBy: [
                { is_dono: 'desc' }, // O cargo do dono sempre aparece no topo da lista
                { id_cargo: 'asc' }
            ]
        });
        res.json(cargos);
    } catch (error) {
        next(error);
    }
};

export const createCargo = async (req, res, next) => {
    try {
        const { nome, descricao, permissoes } = req.body;

        // Valida se as permissões enviadas existem no nosso sistema
        const permissoesValidas = permissoes.filter(p => ALL_PERMISSION_KEYS.includes(p));

        const cargoExiste = await prisma.cargos.findFirst({
            where: { nome: nome, id_tenant: req.tenantId }
        });

        if (cargoExiste) {
            return res.status(400).json({ message: 'Já existe um cargo com este nome.' });
        }

        const novoCargo = await prisma.cargos.create({
            data: {
                id_tenant: req.tenantId,
                nome,
                descricao,
                permissoes: permissoesValidas,
                is_dono: false // Garante que cargos novos nunca sejam do Dono
            }
        });

        res.status(201).json(novoCargo);
    } catch (error) {
        next(error);
    }
};

export const updateCargo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nome, descricao, permissoes, ativo } = req.body;

        // 🔒 BLOQUEIO: Verifica se o cargo que estão tentando editar é o do dono
        const cargoTarget = await prisma.cargos.findUnique({ where: { id_cargo: Number(id) } });
        if (!cargoTarget) return res.status(404).json({ message: 'Cargo não encontrado.' });
        if (cargoTarget.is_dono) return res.status(403).json({ message: 'O cargo de Proprietário é blindado e não pode ser editado.' });

        const permissoesValidas = permissoes ? permissoes.filter(p => ALL_PERMISSION_KEYS.includes(p)) : undefined;

        const cargoAtualizado = await prisma.cargos.update({
            where: { id_cargo: Number(id) },
            data: {
                nome,
                descricao,
                permissoes: permissoesValidas,
                ativo
            }
        });

        res.json(cargoAtualizado);
    } catch (error) {
        next(error);
    }
};

export const deleteCargo = async (req, res, next) => {
    try {
        const { id } = req.params;

        const cargo = await prisma.cargos.findUnique({
            where: { id_cargo: Number(id) },
            include: { _count: { select: { funcionarios: true } } }
        });

        if (!cargo) return res.status(404).json({ message: 'Cargo não encontrado.' });

        // 🔒 BLOQUEIO: Impede a exclusão do cargo do Dono
        if (cargo.is_dono) {
            return res.status(403).json({ message: 'Segurança Mestra: O cargo de Proprietário não pode ser deletado.' });
        }

        if (cargo._count.funcionarios > 0) {
            return res.status(400).json({ message: 'Não é possível excluir um cargo que possui funcionários vinculados.' });
        }

        await prisma.cargos.delete({ where: { id_cargo: Number(id) } });
        res.json({ message: 'Cargo removido com sucesso.' });
    } catch (error) {
        next(error);
    }
};