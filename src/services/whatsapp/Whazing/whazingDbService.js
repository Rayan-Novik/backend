import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken'; // 🟢 ADICIONADO IMPORT DO JWT

dotenv.config();

// 🟢 Instancia o Prisma para buscar as configurações com segurança
const prisma = new PrismaClient();

// 🟢 Cria a conexão com o banco do Whazing/Whaticket
const pool = new pg.Pool({
    host: process.env.WHAZING_DB_HOST,
    port: process.env.WHAZING_DB_PORT || 5432,
    user: process.env.WHAZING_DB_USER,
    password: process.env.WHAZING_DB_PASS,
    database: process.env.WHAZING_DB_NAME,
    max: 5, 
    idleTimeoutMillis: 30000
});

class WhazingDbService {
    
    // ==========================================
    // 🛡️ CENTRALIZADOR DE TENANT COM JWT (SEGURANÇA MÁXIMA)
    // Descriptografa o token, atesta a veracidade e confirma se está ativo!
    // ==========================================
    async _getWhazingTenantId(systemTenantId) {
        if (!systemTenantId) throw new Error("Tenant ID do ERP é obrigatório.");

        // 1. Busca o token salvo na configuração da loja no MySQL
        const config = await prisma.whazing_configuracoes.findUnique({
            where: { id_tenant: Number(systemTenantId) }
        });

        if (!config || !config.token) {
            throw new Error("Token do CRM não configurado para esta empresa no painel.");
        }

        let decodedToken;

        // 2. DESCRIPTOGRAFA E VALIDA O TOKEN USANDO A CHAVE JWT!
        try {
            // Se o token for falso, alterado ou assinado por outro sistema, dá erro e bloqueia a invasão na hora.
            decodedToken = jwt.verify(config.token, process.env.WHAZING_JWT_SECRET);
        } catch (error) {
            console.error("❌ Tentativa de uso de Token Inválido ou Adulterado:", error.message);
            throw new Error("O Token configurado é inválido ou foi adulterado. Gere um novo token no CRM.");
        }

        // 3. Pegamos o ID da empresa do Postgres que estava escondido e lacrado dentro do Token!
        const whazingTenantId = decodedToken.tenantId;

        // 4. Vamos no Postgres confirmar se a API não foi pausada (isActive)
        try {
            const query = `
                SELECT "isActive" 
                FROM "ApiConfigs" 
                WHERE token = $1 
                LIMIT 1
            `;
            const { rows } = await pool.query(query, [config.token]);

            if (rows.length === 0 || rows[0].isActive === false) {
                throw new Error("A conexão da API foi desativada ou excluída no painel do CRM.");
            }

            // 5. Retorna o ID 100% seguro!
            return Number(whazingTenantId);

        } catch (error) {
            // Repassa o erro de negócio ou loga falha de banco
            if (error.message.includes("desativada")) throw error;
            console.error("❌ Erro ao validar status na ApiConfigs:", error.message);
            throw new Error("Falha de comunicação com o banco de dados do CRM.");
        }
    }

    // ==========================================
    // 🟢 BUSCA DE CONTATOS (AUTOCOMPLETE WHATSAPP)
    // ==========================================
    async searchContacts(searchTerm, systemTenantId) {
        try {
            // Busca o ID do Tenant de forma segura usando JWT
            const whazingTenantId = await this._getWhazingTenantId(systemTenantId);

            const query = `
                SELECT id, name, number, pushname, email 
                FROM "Contacts" 
                WHERE "tenantId" = $1 
                  AND "isGroup" = false 
                  AND (name ILIKE $2 OR number LIKE $2 OR pushname ILIKE $2)
                ORDER BY "updatedAt" DESC 
                LIMIT 20
            `;
            
            const searchValue = `%${searchTerm}%`; 
            const { rows } = await pool.query(query, [whazingTenantId, searchValue]);
            return rows;
            
        } catch (error) {
            if (error.message.includes('relation "Contacts" does not exist')) {
                try {
                    const whazingTenantId = await this._getWhazingTenantId(systemTenantId);

                    const fallbackQuery = `
                        SELECT id, name, number, pushname, email 
                        FROM contacts 
                        WHERE "tenantId" = $1 
                          AND "isGroup" = false 
                          AND (name ILIKE $2 OR number LIKE $2 OR pushname ILIKE $2)
                        ORDER BY "updatedAt" DESC 
                        LIMIT 20
                    `;
                    const { rows: fallbackRows } = await pool.query(fallbackQuery, [whazingTenantId, `%${searchTerm}%`]);
                    return fallbackRows;
                } catch (fallbackError) {
                    console.error('[DB] Erro no fallback de searchContacts:', fallbackError.message);
                }
            }
            return [];
        }
    }

    // ==========================================
    // 🟢 KANBAN: RÓTULOS (LABELS)
    // ==========================================
    async getLabelsByBoard(boardId) {
        try {
            const query = `
                SELECT id, "boardId", name, color, position 
                FROM "KanbanLabels" 
                WHERE "boardId" = $1
                ORDER BY position ASC
            `;
            const { rows } = await pool.query(query, [Number(boardId)]);
            return rows;
        } catch (error) {
            if (error.message.includes('relation "KanbanLabels" does not exist')) {
                try {
                    const fallbackQuery = `
                        SELECT id, "boardId", name, color, position 
                        FROM kanban_labels 
                        WHERE "boardId" = $1
                        ORDER BY position ASC
                    `;
                    const { rows: fallbackRows } = await pool.query(fallbackQuery, [Number(boardId)]);
                    return fallbackRows;
                } catch (e) {}
            }
            return []; 
        }
    }

    async createLabel(boardId, name, color) {
        try {
            const positionRes = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM "KanbanLabels" WHERE "boardId" = $1', [Number(boardId)]);
            const nextPos = positionRes.rows[0].next_pos;

            const query = `
                INSERT INTO "KanbanLabels" ("boardId", name, color, position, "createdAt", "updatedAt") 
                VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name, color
            `;
            const { rows } = await pool.query(query, [Number(boardId), String(name), String(color), nextPos]);
            return rows[0];
        } catch (error) {
            try {
                const positionRes = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM kanban_labels WHERE "boardId" = $1', [Number(boardId)]);
                const nextPos = positionRes.rows[0].next_pos;

                const queryFallback = `
                    INSERT INTO kanban_labels ("boardId", name, color, position, "createdAt", "updatedAt") 
                    VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name, color
                `;
                const { rows } = await pool.query(queryFallback, [Number(boardId), String(name), String(color), nextPos]);
                return rows[0];
            } catch (fallbackError) {
                console.error('\n❌ ERRO AO CRIAR RÓTULO:', fallbackError.message);
                return null;
            }
        }
    }

    // ==========================================
    // 🟢 KANBAN: CARDS (BYPASS BANCO)
    // ==========================================
    async updateCardCompleto(cardId, data) {
        try {
            const { dealValue, note, labelIds, startDate } = data;
            const arrayRotulos = Array.isArray(labelIds) ? labelIds.map(Number) : [];

            const query = `
                UPDATE "KanbanCards" 
                SET "labelIds" = $1, 
                    "dealValue" = $2, 
                    "note" = $3,
                    "startDate" = $4,
                    "updatedAt" = NOW() 
                WHERE id = $5
            `;

            const dateParsed = startDate ? new Date(startDate) : new Date();

            await pool.query(query, [arrayRotulos, Number(dealValue || 0), String(note || ''), dateParsed, Number(cardId)]);
            return true;
        } catch (error) {
            try {
                const { dealValue, note, labelIds, startDate } = data;
                const arrayRotulos = Array.isArray(labelIds) ? labelIds.map(Number) : [];
                
                const queryFallback = `
                    UPDATE kanban_cards 
                    SET "labelIds" = $1, "dealValue" = $2, "note" = $3, "startDate" = $4, "updatedAt" = NOW() 
                    WHERE id = $5
                `;
                const dateParsed = startDate ? new Date(startDate) : new Date();
                await pool.query(queryFallback, [arrayRotulos, Number(dealValue || 0), String(note || ''), dateParsed, Number(cardId)]);
                return true;
            } catch (fallbackError) {
                console.error('\n❌ ERRO AO INJETAR DADOS DO CARD NO BANCO:', fallbackError.message);
                return false;
            }
        }
    }
    
    async updateCardLabels(cardId, labelIds) {
        try {
            const arrayRotulos = Array.isArray(labelIds) ? labelIds.map(Number) : [];

            await pool.query(
                `UPDATE "KanbanCards" SET "labelIds" = $1, "updatedAt" = NOW() WHERE id = $2`,
                [arrayRotulos, Number(cardId)]
            );
            return true;
        } catch (error) {
            try {
                const arrayRotulos = Array.isArray(labelIds) ? labelIds.map(Number) : [];
                await pool.query(
                    `UPDATE kanban_cards SET "labelIds" = $1, "updatedAt" = NOW() WHERE id = $2`,
                    [arrayRotulos, Number(cardId)]
                );
                return true;
            } catch (fallbackError) {
                console.error('\n❌ ERRO AO SALVAR RÓTULOS NO BANCO:', fallbackError.message);
                return false;
            }
        }
    }

    async getLatestCardByContact(contactId, boardId) {
        try {
            const query = `
                SELECT id FROM "KanbanCards" 
                WHERE "contactId" = $1 AND "boardId" = $2 
                ORDER BY "createdAt" DESC LIMIT 1
            `;
            const { rows } = await pool.query(query, [Number(contactId), Number(boardId)]);
            return rows[0]?.id || null;
        } catch (error) {
            try {
                const queryFallback = `
                    SELECT id FROM kanban_cards 
                    WHERE "contactId" = $1 AND "boardId" = $2 
                    ORDER BY "createdAt" DESC LIMIT 1
                `;
                const { rows } = await pool.query(queryFallback, [Number(contactId), Number(boardId)]);
                return rows[0]?.id || null;
            } catch (e) {
                return null;
            }
        }
    }

    // ==========================================
    // 🟢 CRM: TICKETS (FILAS)
    // ==========================================
    async getFirstQueueId(systemTenantId) {
        try {
            // Busca o ID do Tenant Seguro via JWT
            const whazingTenantId = await this._getWhazingTenantId(systemTenantId);

            const query = `SELECT id FROM "Queues" WHERE "tenantId" = $1 ORDER BY "createdAt" ASC LIMIT 1`;
            const { rows } = await pool.query(query, [whazingTenantId]);

            return rows.length > 0 ? rows[0].id : null;
        } catch (error) {
            if (error.message.includes('relation "Queues" does not exist')) {
                try {
                    const whazingTenantId = await this._getWhazingTenantId(systemTenantId);
                    const queryFallback = `SELECT id FROM queues WHERE "tenantId" = $1 ORDER BY "createdAt" ASC LIMIT 1`;
                    const { rows } = await pool.query(queryFallback, [whazingTenantId]);
                    return rows.length > 0 ? rows[0].id : null;
                } catch (fallbackError) {
                    return null;
                }
            }
            return null;
        }
    }

    // ==========================================
    // 🟢 SINCRONIZADOR DE USUÁRIOS (WHATSAPP)
    // ==========================================
    async syncWhazingUser(systemTenantId, name, email, password, role) {
        try {
            // Busca o ID do Tenant Seguro via JWT
            const whazingTenantId = await this._getWhazingTenantId(systemTenantId);
            
            // O Whazing/Whaticket usa 'admin' ou 'user' no campo profile
            const profile = (role && role.toUpperCase().includes('ADMIN')) ? 'admin' : 'user';

            // Verifica se o usuário já existe lá
            const checkQuery = `SELECT id FROM "Users" WHERE email = $1 AND "tenantId" = $2`;
            const { rows } = await pool.query(checkQuery, [email, whazingTenantId]);

            let hash = null;
            if (password) {
                // A maioria das instalações do Whaticket usa salt 8
                hash = await bcrypt.hash(password, 8);
            }

            if (rows.length > 0) {
                // ATUALIZA O USUÁRIO EXISTENTE NO WHAZING
                const userId = rows[0].id;
                let updateQuery = `UPDATE "Users" SET name = $1, profile = $2, "updatedAt" = NOW()`;
                const params = [name, profile];
                
                if (hash) {
                    updateQuery += `, "passwordHash" = $3`;
                    params.push(hash);
                }
                
                updateQuery += ` WHERE id = $${params.length + 1}`;
                params.push(userId);
                
                await pool.query(updateQuery, params);
                return true;
            } else {
                // CRIA UM NOVO USUÁRIO NO WHAZING
                if (!hash) hash = await bcrypt.hash('123456', 8); // Senha padrão caso falhe

                const insertQuery = `
                    INSERT INTO "Users" (name, email, "passwordHash", profile, "tokenVersion", "tenantId", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, $4, 0, $5, NOW(), NOW())
                `;
                await pool.query(insertQuery, [name, email, hash, profile, whazingTenantId]);
                return true;
            }
        } catch (error) {
            // Tenta o Fallback minúsculo (users em vez de "Users")
            try {
                const whazingTenantId = await this._getWhazingTenantId(systemTenantId);
                const profile = (role && role.toUpperCase().includes('ADMIN')) ? 'admin' : 'user';

                const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1 AND "tenantId" = $2`, [email, whazingTenantId]);
                let hash = password ? await bcrypt.hash(password, 8) : null;

                if (rows.length > 0) {
                    let updateQuery = `UPDATE users SET name = $1, profile = $2, "updatedAt" = NOW()`;
                    const params = [name, profile];
                    if (hash) { updateQuery += `, "passwordHash" = $3`; params.push(hash); }
                    updateQuery += ` WHERE id = $${params.length + 1}`;
                    params.push(rows[0].id);
                    await pool.query(updateQuery, params);
                } else {
                    if (!hash) hash = await bcrypt.hash('123456', 8);
                    await pool.query(
                        `INSERT INTO users (name, email, "passwordHash", profile, "tokenVersion", "tenantId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 0, $5, NOW(), NOW())`,
                        [name, email, hash, profile, whazingTenantId]
                    );
                }
                return true;
            } catch (fallbackError) {
                console.error('\n❌ ERRO AO SINCRONIZAR USUÁRIO WHAZING:', fallbackError.message);
                throw new Error('Falha na integração com o banco do Whazing.');
            }
        }
    }
}

export default new WhazingDbService();