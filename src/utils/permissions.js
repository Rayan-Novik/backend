// utils/permissions.js

export const PERMISSIONS = {
    // VENDAS & PEDIDOS
    DASHBOARD_VIEW: 'Visualizar Dashboard Principal',
    PDV_ACCESS: 'Acessar Caixa/PDV',
    PEDIDOS_VIEW: 'Visualizar Pedidos Online',
    PEDIDOS_MANAGE: 'Despachar / Editar Status de Pedidos',
    CLIENTES_MANAGE: 'Gerenciar Clientes',

    // PRODUTOS & ESTOQUE
    PRODUTOS_VIEW: 'Visualizar Lista de Produtos',
    PRODUTOS_MANAGE: 'Criar / Editar / Excluir Produtos',
    ESTOQUE_MANAGE: 'Gerenciar Estoque e Fornecedores',
    AVALIACOES_MANAGE: 'Gerenciar Avaliações de Clientes',

    // MARKETING
    MARKETING_VIEW: 'Visualizar Campanhas e Resultados',
    MARKETING_MANAGE: 'Criar e Gerenciar Campanhas',

    // CAIXA E FINANCEIRO
    FINANCEIRO_VIEW: 'Acessar Auditoria Financeira',
    FINANCEIRO_MANAGE: 'Fazer Sangria/Suprimento no Caixa',
    CONTAS_MANAGE: 'Gerenciar Contas Pagar/Receber',

    // 🟢 RELATÓRIOS (A CHAVE QUE FALTAVA!)
    RELATORIOS_VIEW: 'Visualizar Relatórios e Faturamento',

    // EQUIPE
    EQUIPE_VIEW: 'Visualizar Equipe e Cargos',
    EQUIPE_MANAGE: 'Gerenciar Usuários e Permissões',

    // CONFIGURAÇÕES DA LOJA
    CONFIG_APARENCIA: 'Aparência da Loja',
    CONFIG_DOMINIO: 'Domínio Próprio',
    CONFIG_UNIDADES: 'Unidades Físicas',
    CONFIG_ENVIO: 'Regras de Envio',
    CONFIG_PIX: 'Desconto Pix',
    CONFIG_EMAIL: 'Servidor de E-mail',

    // WHATSAPP
    WHATSAPP_VIEW: 'Visualizar Conversas do WhatsApp',
    WHATSAPP_SEND: 'Enviar Mensagens no WhatsApp',
    WHATSAPP_MANAGE: 'Administrar Integração do WhatsApp',

    // IFOOD
    IFOOD_VIEW: 'Vizualizar as informações do ifood',
    IFOOD_MANAGER: 'Editar/Publicar Produtos & Pedidos',
    IFOOD_SEND: 'Enviar Mensagens para clientes',

    // MERCADO LIVRE (***OBS: AINDA PRECISA CONFIGURAR***!!!)
    ML_VIEW: 'Visualizar as Informações do Mercado Livre',
    ML_MANAGER: 'Editar/Publicar Produtos/Pedidos Mercado livre',
    ML_SEND: 'Responder Comentarios & enviar Mensagens para Clientes',

    // INTEGRAÇÕES E API
    CONFIG_GATEWAYS: 'Gateways de Pagamento',
    CONFIG_INTEGRATIONS: 'Integrações e Chaves de API'
};

// Retorna todas as chaves (usado para validações)
export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS);