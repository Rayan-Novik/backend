import { PrismaClient } from '@prisma/client';
import db from '../config/database.js';
const prisma = new PrismaClient();

export default {
    async findByUserId(id_usuario) {
        // Adicionamos a condição "AND is_active = TRUE"
        const sql = `SELECT * FROM enderecos WHERE id_usuario = ? AND is_active = TRUE`;
        const [rows] = await db.query(sql, [id_usuario]);
        return rows;
    },


    async findById(id_endereco, id_usuario) {
        return prisma.enderecos.findFirst({
            where: {
                id_endereco: id_endereco,
                id_usuario: id_usuario
            },
        });
    },

    async create(id_usuario, dadosEndereco) {
        return prisma.enderecos.create({
            data: {
                ...dadosEndereco, // Passa todos os dados do endereço
                id_usuario: id_usuario,
            }
        });
    },

    async update(id_endereco, id_usuario, dadosEndereco) {
        return prisma.enderecos.updateMany({
            where: {
                id_endereco: id_endereco,
                id_usuario: id_usuario,
            },
            data: dadosEndereco,
        });
    },
    async remove(id_endereco, id_usuario) {
        const sql = `UPDATE enderecos SET is_active = false WHERE id_endereco = ? AND id_usuario = ?`;
        const [result] = await db.query(sql, [id_endereco, id_usuario]);
        return result;
    },
};
