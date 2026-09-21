import { Router } from 'express';
import kanbanController from '../controllers/KanbanController.js';

const router = Router();

// ==========================================
// 1. ROTAS DO KANBAN (Boards, Colunas, Cards)
// ==========================================
router.get('/boards', kanbanController.listarBoards);
router.get('/boards/:boardId/columns', kanbanController.listarColunas);
router.get('/boards/:boardId/cards', kanbanController.listarCards);
router.get('/boards/:boardId/labels', kanbanController.listarLabels);
router.put('/cards/:cardId', kanbanController.atualizarCard);
router.delete('/cards/:cardId', kanbanController.arquivarCard);

// ==========================================
// 2. ROTAS DOS CHECKLISTS
// ==========================================
router.get('/cards/:cardId/checklists', kanbanController.listarChecklists);
router.post('/cards/:cardId/checklists', kanbanController.criarChecklist);
router.put('/checklists/:itemId', kanbanController.atualizarChecklist);
router.delete('/checklists/:itemId', kanbanController.deletarChecklist);

// ==========================================
// 3. ROTAS DO WHAZING CRM (WhatsApp & Tickets)
// ==========================================
// Busca os tickets abertos informando o número do cliente
router.post('/whazing/tickets', kanbanController.buscarTicketsWhazing);

// Cria um ticket pendente para o número informado
router.post('/whazing/tickets/create', kanbanController.criarTicketWhazing);

// 🟢 Busca as mensagens de um ticket específico para o Popup de Chat
router.get('/whazing/tickets/:ticketId/messages', kanbanController.listarMensagensTicket);

// Envia o Orçamento (PDF ou Texto) usando o ID do Ticket selecionado no Modal
router.post('/tickets/:ticketId/enviar-orcamento', kanbanController.enviarOrcamento);

// Envia uma mensagem avulsa pelo número do WhatsApp do cliente
router.post('/whazing/message', kanbanController.enviarMensagemWhazing);

// Busca os contatos no banco de dados para a barra de pesquisa (Lupa)
router.get('/whazing/contacts/search', kanbanController.buscarContatosWhazing);

// 🟢 NOVAS ROTAS: Status do Canal e Geração do QR Code
router.get('/whazing/status', kanbanController.checarStatusCanal);
router.post('/whazing/qrcode', kanbanController.gerarQrCode);

export default router;