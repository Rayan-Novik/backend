import sql from 'mssql';
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/crypto.js';

const prisma = new PrismaClient();

// CONFIGURAÇÃO: Colunas do Cliente -> Suas Colunas
const MAP = {
    id: 'cd_item',              // ID deles
    nome: 'desc_item',          // Nome deles
    preco: 'vlr_preco_venda',   // Preço deles
    estoque: 'qt_saldo_estoque',// Estoque deles
    ativo: 'situacao'           // Status deles
};

export const syncExternalProducts = async () => {
    const config = await prisma.config_integracao.findFirst();
    
    // Se não tiver config ou estiver desativado, para.
    if (!config || !config.ativo) return;

    let pool;
    try {
        // DESCRIPTOGRAFA A SENHA AQUI
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
            // Exemplo de lógica de ativo (Adapte conforme o banco do cliente)
            const isAtivo = ['A', 'S', 'ATIVO'].includes(item[MAP.ativo]?.toUpperCase());

            await prisma.produtos.upsert({
                where: { id_externo: idExterno }, // Precisa ter criado o campo id_externo @unique antes
                update: {
                    nome: item[MAP.nome]?.trim(),
                    preco: parseFloat(item[MAP.preco] || 0),
                    estoque: parseInt(item[MAP.estoque] || 0),
                    active_ecommerce: isAtivo
                },
                create: {
                    id_externo: idExterno,
                    nome: item[MAP.nome]?.trim(),
                    preco: parseFloat(item[MAP.preco] || 0),
                    estoque: parseInt(item[MAP.estoque] || 0),
                    active_ecommerce: isAtivo,
                    descricao: "Importado via integração",
                    // IDs padrão obrigatórios (Crie uma categoria "Geral" ID 1 no seu banco)
                    id_categoria: 1, 
                    id_marca: 1
                }
            });
        }
        
        // Atualiza data da ultima sync
        await prisma.config_integracao.update({
            where: { id: config.id },
            data: { ultima_sincronizacao: new Date() }
        });

    } catch (error) {
        console.error("Erro no Sync:", error);
        throw error;
    } finally {
        if (pool) pool.close();
    }
};