import kanbanService from '../services/whatsapp/Whazing/kanbanService.js';
import whazingCrmService from '../services/whatsapp/Whazing/whazingCrmService.js';
import whazingDbService from '../services/whatsapp/Whazing/whazingDbService.js';

class KanbanController {
  
  // ==========================================
  // 1. KANBAN (Boards, Colunas e Cards)
  // ==========================================

  async listarBoards(req, res) {
    try {
      const boards = await kanbanService.getBoards(req.tenantId);
      return res.status(200).json(boards);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async listarLabels(req, res) {
    try {
      const { boardId } = req.params;
      
      // Chamando whazingDbService direto no banco
      const labels = await whazingDbService.getLabelsByBoard(boardId);
      
      return res.status(200).json(labels);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async listarColunas(req, res) {
    try {
      const { boardId } = req.params;
      const colunas = await kanbanService.getColumns(boardId, req.tenantId);
      return res.status(200).json(colunas);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async listarCards(req, res) {
    try {
      const { boardId } = req.params;
      const queryParams = req.query; 
      
      const cards = await kanbanService.getCards(boardId, queryParams, req.tenantId);
      return res.status(200).json(cards);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async atualizarCard(req, res) {
    try {
      const { cardId } = req.params;
      
      // 🛡️ SEGURANÇA (Prevenção de IDOR): 
      // 1. Atualiza via API primeiro. A API usa o Bearer Token do Tenant.
      // Se o card não pertencer a esta empresa, a API disparará um erro e cairá no catch.
      const data = await kanbanService.updateCard(cardId, req.body, req.tenantId);
      
      // 2. 🟢 Atualiza TUDO pelo Banco de Dados (Bypass) SOMENTE SE a API autorizou!
      if (data) {
          await whazingDbService.updateCardCompleto(cardId, {
              dealValue: req.body.dealValue || req.body.value,
              note: req.body.note,
              labelIds: req.body.labelIds,
              startDate: req.body.startDate
          });
      }
      
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async arquivarCard(req, res) {
    try {
      const { cardId } = req.params;
      const data = await kanbanService.deleteCard(cardId, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  // ==========================================
  // 2. CHECKLISTS DOS CARDS
  // ==========================================

  async listarChecklists(req, res) {
    try {
      const { cardId } = req.params;
      const data = await kanbanService.getChecklists(cardId, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async criarChecklist(req, res) {
    try {
      const { cardId } = req.params;
      const data = await kanbanService.addChecklistItem(cardId, req.body, req.tenantId);
      return res.status(201).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async atualizarChecklist(req, res) {
    try {
      const { itemId } = req.params;
      const data = await kanbanService.updateChecklistItem(itemId, req.body, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async deletarChecklist(req, res) {
    try {
      const { itemId } = req.params;
      const data = await kanbanService.deleteChecklistItem(itemId, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  // ==========================================
  // 3. WHAZING CRM (WhatsApp & Tickets)
  // ==========================================

  async buscarTicketsWhazing(req, res) {
    try {
      const { number } = req.body;
      const data = await whazingCrmService.getTicketsByNumber(number, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async criarTicketWhazing(req, res) {
    try {
      const { number } = req.body;
      const data = await whazingCrmService.createTicket(number, req.tenantId);
      return res.status(201).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async enviarOrcamento(req, res) {
    try {
      const { ticketId } = req.params;
      const data = await whazingCrmService.sendQuoteToTicketId(ticketId, req.body, req.tenantId);
      return res.status(200).json({ message: "Orçamento enviado com sucesso!", data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async enviarMensagemWhazing(req, res) {
    try {
      const { number, message, cardData, produtosList } = req.body;
      
      let data;
      if (cardData && produtosList) {
          data = await whazingCrmService.sendQuoteMessage(number, cardData, produtosList, req.tenantId);
      } else {
          data = await whazingCrmService.sendMessageByNumber(number, message, req.tenantId);
      }

      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  // 🟢 BUSCA DE CONTATOS (Autocomplete do Front-end)
  async buscarContatosWhazing(req, res) {
    try {
      const { q } = req.query; 

      if (!q || q.length < 2) return res.status(200).json([]);

      // Pega o ID da empresa diretamente da sessão/token do Tenant logado
      const tenantId = req.tenantId;

      // Chama nossa consulta segura no PostgreSQL passando o tenantId do ERP
      const contatos = await whazingDbService.searchContacts(q, tenantId);
      
      const resultadosFormatados = contatos.map(contato => ({
        id: contato.id,
        name: contato.name || contato.pushname || 'Sem nome',
        number: contato.number
      }));

      return res.status(200).json(resultadosFormatados);

    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async listarMensagensTicket(req, res) {
    try {
      const { ticketId } = req.params;
      const data = await whazingCrmService.getTicketMessages(ticketId, req.tenantId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  // 🟢 STATUS DO CANAL WHAZING
    async checarStatusCanal(req, res) {
        try {
            // O tenantId vem do seu middleware de autenticação (protect)
            const id_tenant = req.tenantId || req.user?.id_tenant || 1; 
            const data = await whazingCrmService.getChannelStatus(id_tenant);
            return res.status(200).json(data);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // 🟢 GERAR QR CODE WHAZING
    async gerarQrCode(req, res) {
        try {
            const id_tenant = req.tenantId || req.user?.id_tenant || 1;
            const data = await whazingCrmService.getChannelQrCode(id_tenant);
            return res.status(200).json(data);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }
}

export default new KanbanController();