import sql from 'mssql';
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/crypto.js';

const prisma = new PrismaClient();

const MAP = {
    id: 'cd_item',              
    nome: 'desc_item',          
    preco: 'vlr_preco_venda',   
    estoque: 'qt_saldo_estoque',
    ativo: 'situacao'           
};

export const syncExternalProducts = async (id_tenant) => {
    const config = await prisma.config_integracao.findFirst({
        where: { id_tenant: id_tenant }
    });
    
    if (!config || !config.ativo) return;

    let pool;
    try {
        const realPassword = decrypt(config.password);

        pool = await sql.connect({
            user: config.user,
            password: realPassword, 
            database: config.database,
            server: config.host,
            port: config.port,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const result = await pool.request().query(`
            SELECT ${MAP.id}, ${MAP.nome}, ${MAP.preco}, ${MAP.estoque}, ${MAP.ativo}
            FROM ${config.tabela_origem}
        `);

        for (const item of result.recordset) {
            const idExterno = String(item[MAP.id]);
            const isAtivo = ['A', 'S', 'ATIVO'].includes(item[MAP.ativo]?.toUpperCase());

            const existingProduct = await prisma.produtos.findFirst({
                where: { 
                    id_externo: idExterno,
                    id_tenant: id_tenant
                }
            });

            if (existingProduct) {
                await prisma.produtos.updateMany({
                    where: { 
                        id_produto: existingProduct.id_produto,
                        id_tenant: id_tenant
                    },
                    data: {
                        nome: item[MAP.nome]?.trim(),
                        preco: parseFloat(item[MAP.preco] || 0),
                        estoque: parseInt(item[MAP.estoque] || 0),
                        active_ecommerce: isAtivo
                    }
                });
            } else {
                await prisma.produtos.create({
                    data: {
                        id_externo: idExterno,
                        nome: item[MAP.nome]?.trim(),
                        preco: parseFloat(item[MAP.preco] || 0),
                        estoque: parseInt(item[MAP.estoque] || 0),
                        active_ecommerce: isAtivo,
                        descricao: "Importado via integração",
                        id_categoria: 1, 
                        id_marca: 1,
                        id_tenant: id_tenant
                    }
                });
            }
        }
        
        await prisma.config_integracao.updateMany({
            where: { 
                id: config.id,
                id_tenant: id_tenant
            },
            data: { ultima_sincronizacao: new Date() }
        });

    } catch (error) {
        console.error("Erro no Sync:", error);
        throw error;
    } finally {
        if (pool) pool.close();
    }
};