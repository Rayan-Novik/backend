import axios from 'axios';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

class KanbanService {
    
    async _getApi(tenantId) {
        if (!tenantId) throw new Error("Tenant ID é obrigatório para acessar o Kanban.");

        const config = await prisma.whazing_configuracoes.findUnique({
            where: { id_tenant: Number(tenantId) }
        });

        if (!config || !config.api_id) {
            throw new Error("Credenciais do Kanban não configuradas para esta loja no painel.");
        }

        const baseUrl = config.base_url;

        return axios.create({
            baseURL: `${baseUrl}/${config.api_id}/kanbanpro`,
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async getBoards(tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.get('/boards');
            return response.data;
        } catch (error) {
            console.error('[Kanban] Erro ao buscar boards:', error.response?.data || error.message);
            throw new Error('Falha ao listar boards do Kanban. Verifique suas credenciais.');
        }
    }

    async getColumns(boardId, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.get(`/boards/${boardId}/columns`);
            return response.data;
        } catch (error) {
            console.error(`[Kanban] Erro ao buscar colunas do board ${boardId}:`, error.message);
            throw new Error('Falha ao listar colunas');
        }
    }

    async getCards(boardId, queryParams = {}, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.get(`/boards/${boardId}/cards`, { params: queryParams });
            return response.data;
        } catch (error) {
            console.error('[Kanban] Erro ao buscar cards:', error.message);
            throw new Error('Falha ao listar cards');
        }
    }

    async updateCard(cardId, data, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const safePayload = {};

            if (data.title) safePayload.title = String(data.title);
            if (data.priority) safePayload.priority = String(data.priority);
            if (data.columnId) safePayload.columnId = Number(data.columnId);
            
            if (data.assigneeId && !isNaN(Number(data.assigneeId))) {
                safePayload.assigneeId = Number(data.assigneeId);
            }
            if (data.contactId && !isNaN(Number(data.contactId))) {
                safePayload.contactId = Number(data.contactId);
            }
            if (data.dueDate) safePayload.dueDate = String(data.dueDate);
            if (data.note !== undefined) safePayload.note = String(data.note);
            if (data.dealValue !== undefined && data.dealValue !== null) {
                safePayload.dealValue = Number(data.dealValue);
            }

            const response = await api.put(`/card/${cardId}`, safePayload);
            return response.data;
        } catch (error) {
            console.error(`\n❌ ERRO KANBAN (PUT /card/${cardId}):`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Falha ao atualizar card');
        }
    }

    async deleteCard(cardId, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.delete(`/card/${cardId}`);
            return response.data;
        } catch (error) {
            console.error(`\n❌ ERRO KANBAN (DELETE /card/${cardId}):`, error.message);
            throw new Error('Falha ao arquivar card');
        }
    }

    // =====================================
    // CHECKLISTS 
    // =====================================
    async getChecklists(cardId, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.get(`/cards/${cardId}/checklists`);
            return response.data;
        } catch (error) {
            return []; 
        }
    }

    async addChecklistItem(cardId, data, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const safePayload = {
                text: data.text || data.title || 'Item sem nome',
                isCompleted: typeof data.isCompleted === 'boolean' ? data.isCompleted : false
            };

            const response = await api.post(`/cards/${cardId}/checklists`, safePayload);
            return response.data;
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Falha ao criar item no checklist');
        }
    }

    async updateChecklistItem(itemId, data, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const safePayload = {};
            if (data.text || data.title) safePayload.text = data.text || data.title;
            if (typeof data.isCompleted === 'boolean') safePayload.isCompleted = data.isCompleted;

            const response = await api.put(`/checklists/${itemId}`, safePayload);
            return response.data;
        } catch (error) {
            throw new Error('Falha ao atualizar item no checklist');
        }
    }

    async deleteChecklistItem(itemId, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.delete(`/checklists/${itemId}`);
            return response.data;
        } catch (error) {
            throw new Error('Falha ao deletar item do checklist');
        }
    }

    async getLabels(boardId, tenantId) {
        try {
            const api = await this._getApi(tenantId);
            const response = await api.get(`/boards/${boardId}/labels`);
            return response.data;
        } catch (error) {
            console.error(`[Kanban] Erro ao buscar rótulos do board ${boardId}:`, error.message);
            // Retornamos array vazio para não quebrar a tela
            return []; 
        }
    }

    // 🟢 STATUS DO CANAL WHAZING
    async checarStatusCanal(req, res) {
    try {
      const data = await whazingCrmService.getChannelStatus(req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async gerarQrCode(req, res) {
    try {
      const data = await whazingCrmService.getChannelQrCode(req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

export default new KanbanService();