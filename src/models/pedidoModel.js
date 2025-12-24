import db from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const T_PEDIDOS = process.env.TABLE_PEDIDOS_NOME;
const T_PEDIDO_ITEMS = process.env.TABLE_PEDIDO_ITEMS_NOME;
const T_ENDERECOS = process.env.TABLE_ENDERECOS_NOME;
const T_USUARIOS = process.env.TABLE_USUARIOS_NOME;

export default {
    async create(pedidoData, itemsData) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // ✅ SQL ATUALIZADO: Inclui as colunas de snapshot (entrega_...)
            const pedidoSql = `
                INSERT INTO ${T_PEDIDOS} (
                    id_usuario, id_endereco_entrega, metodo_pagamento, 
                    preco_itens, preco_frete, preco_total, 
                    status_pagamento, id_pagamento_gateway,
                    entrega_logradouro, entrega_numero, entrega_bairro,
                    entrega_cidade, entrega_estado, entrega_cep, entrega_complemento
                ) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [pedidoResult] = await connection.query(pedidoSql, [
                pedidoData.id_usuario,
                pedidoData.id_endereco_entrega,
                pedidoData.metodo_pagamento,
                pedidoData.preco_itens,
                pedidoData.preco_frete,
                pedidoData.preco_total,
                pedidoData.status_pagamento,
                pedidoData.id_pagamento_gateway,
                // ✅ Novos valores do Snapshot
                pedidoData.entrega_logradouro,
                pedidoData.entrega_numero,
                pedidoData.entrega_bairro,
                pedidoData.entrega_cidade,
                pedidoData.entrega_estado,
                pedidoData.entrega_cep,
                pedidoData.entrega_complemento
            ]);
            
            const id_pedido = pedidoResult.insertId;

            const itemsSql = `INSERT INTO ${T_PEDIDO_ITEMS} (id_pedido, id_produto, nome, quantidade, preco, imagem_url) VALUES ?`;
            const itemsValues = itemsData.map(item => [
                id_pedido, 
                item.produtos.id_produto, 
                item.produtos.nome, 
                item.quantidade, 
                parseFloat(item.produtos.preco), 
                item.produtos.imagem_url
            ]);
            await connection.query(itemsSql, [itemsValues]);

            await connection.commit();
            return { id_pedido };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // ✅ FIND BY ID CORRIGIDO (Permite pedidos sem endereço vinculado)
    async findById(id_param, id_usuario) { 
        let pedidoSql = `
            SELECT 
                p.*, 
                e.*, 
                u.nome_completo, 
                u.email,
                u.cpf_criptografado,
                u.telefone_criptografado  -- ✅ NOME CORRETO DA COLUNA NO SEU BANCO
            FROM ${T_PEDIDOS} p
            LEFT JOIN ${T_ENDERECOS} e ON p.id_endereco_entrega = e.id_endereco
            JOIN ${T_USUARIOS} u ON p.id_usuario = u.id_usuario
            WHERE (p.id_pedido = ? OR p.id_pagamento_gateway = ?)
        `;
        
        const params = [id_param, id_param];

        if (id_usuario) {
            pedidoSql += ` AND p.id_usuario = ?`;
            params.push(id_usuario);
        }

        const [pedidoRows] = await db.query(pedidoSql, params);
        const pedido = pedidoRows[0];

        if (!pedido) {
            return null;
        }

        const itemsSql = `SELECT * FROM ${T_PEDIDO_ITEMS} WHERE id_pedido = ?`;
        const [items] = await db.query(itemsSql, [pedido.id_pedido]);

        return {
            pedido: pedido,
            cliente: pedido, 
            endereco: pedido.id_endereco ? pedido : {
                logradouro: pedido.entrega_logradouro,
                numero: pedido.entrega_numero,
                bairro: pedido.entrega_bairro,
                cidade: pedido.entrega_cidade,
                estado: pedido.entrega_estado,
                cep: pedido.entrega_cep,
                complemento: pedido.entrega_complemento
            },
            items: items
        };
    },

    async findAllByUserId(id_usuario) {
        const sql = `
            SELECT 
                id_pedido, 
                data_pedido, 
                preco_total, 
                status_pagamento 
            FROM ${T_PEDIDOS} 
            WHERE id_usuario = ? 
            ORDER BY data_pedido DESC
        `;
        const [rows] = await db.query(sql, [id_usuario]);
        return rows;
    },

    async findAll() {
        const sql = `
            SELECT p.*, u.nome_completo 
            FROM ${T_PEDIDOS} p
            JOIN ${T_USUARIOS} u ON p.id_usuario = u.id_usuario
            ORDER BY p.data_pedido DESC
        `;
        const [rows] = await db.query(sql);
        return rows;
    },

    async update(id_pedido, data) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const setClause = fields.map(field => `${field} = ?`).join(', ');

        const sql = `UPDATE ${T_PEDIDOS} SET ${setClause} WHERE id_pedido = ?`;
        const [result] = await db.query(sql, [...values, id_pedido]);
        return result;
    },

    async remove(id_pedido) {
        const sql = `DELETE FROM ${T_PEDIDOS} WHERE id_pedido = ?`;
        const [result] = await db.query(sql, [id_pedido]);
        return result;
    },
    
    async count() {
        const sql = `SELECT COUNT(*) as total FROM ${T_PEDIDOS}`;
        const [rows] = await db.query(sql);
        return rows[0].total;
    },

    async aggregate() {
        const sql = `
            SELECT 
                SUM(CASE WHEN status_pagamento = 'PAGO' THEN preco_total ELSE 0 END) as totalVendas,
                SUM(CASE WHEN status_pagamento = 'PENDENTE' THEN preco_total ELSE 0 END) as totalPendente
            FROM ${T_PEDIDOS}
        `;
        const [rows] = await db.query(sql);
        const data = rows[0];

        return {
            totalVendas: parseFloat(data.totalVendas) || 0,
            totalPendente: parseFloat(data.totalPendente) || 0,
        };
    },
    
    async getSalesOverTime() {
        const sql = `
            SELECT
                DATE_FORMAT(data_pedido, '%Y-%m') as mes,
                SUM(CASE WHEN status_pagamento = 'PAGO' THEN preco_total ELSE 0 END) as vendasConfirmadas,
                SUM(CASE WHEN status_pagamento = 'PENDENTE' THEN preco_total ELSE 0 END) as vendasPendentes
            FROM ${T_PEDIDOS}
            WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY mes
            ORDER BY mes ASC;
        `;
        const [rows] = await db.query(sql);
        return rows;
    },
    
    async findMany(options) {
        const sql = `
            SELECT p.*, u.nome_completo 
            FROM ${T_PEDIDOS} p
            JOIN ${T_USUARIOS} u ON p.id_usuario = u.id_usuario
            ORDER BY p.data_pedido DESC
            LIMIT ?
        `;
        const [rows] = await db.query(sql, [options.take]);
        return rows.map(row => ({ ...row, usuarios: { nome_completo: row.nome_completo } }));
    },

    async updatePaymentStatusByGatewayId(gatewayId, status) {
        const sql = `UPDATE ${T_PEDIDOS} SET status_pagamento = ? WHERE id_pagamento_gateway = ?`;
        const [result] = await db.query(sql, [status, gatewayId]);
        return result;
    },

    async findByAddressId(id_endereco) {
        const sql = `SELECT id_pedido FROM ${T_PEDIDOS} WHERE id_endereco_entrega = ?`;
        const [rows] = await db.query(sql, [id_endereco]);
        return rows;
    },
};