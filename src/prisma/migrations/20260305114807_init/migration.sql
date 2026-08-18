-- CreateTable
CREATE TABLE `carrinhos` (
    `id_carrinho` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(10, 3) NOT NULL,
    `data_adicionado` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `id_produto`(`id_produto`),
    UNIQUE INDEX `id_usuario`(`id_usuario`, `id_produto`),
    PRIMARY KEY (`id_carrinho`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enderecos` (
    `id_endereco` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `cep` VARCHAR(10) NOT NULL,
    `logradouro` VARCHAR(255) NOT NULL,
    `numero` VARCHAR(20) NOT NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NOT NULL,
    `cidade` VARCHAR(100) NOT NULL,
    `estado` VARCHAR(2) NOT NULL,
    `is_principal` BOOLEAN NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id_endereco`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_items` (
    `id_item` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido` INTEGER NOT NULL,
    `id_produto` INTEGER NULL,
    `nome` VARCHAR(255) NOT NULL,
    `quantidade` DECIMAL(10, 3) NOT NULL,
    `preco` DECIMAL(10, 2) NOT NULL,
    `imagem_url` VARCHAR(2048) NULL,
    `id_tenant` INTEGER NOT NULL DEFAULT 1,

    INDEX `id_pedido`(`id_pedido`),
    INDEX `fk_pedido_items_tenant`(`id_tenant`),
    PRIMARY KEY (`id_item`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos` (
    `id_pedido` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_endereco_entrega` INTEGER NULL,
    `entrega_cep` VARCHAR(10) NULL,
    `entrega_logradouro` VARCHAR(255) NULL,
    `entrega_numero` VARCHAR(20) NULL,
    `entrega_complemento` VARCHAR(100) NULL,
    `entrega_bairro` VARCHAR(100) NULL,
    `entrega_cidade` VARCHAR(100) NULL,
    `entrega_estado` VARCHAR(50) NULL,
    `metodo_pagamento` VARCHAR(50) NOT NULL,
    `preco_itens` DECIMAL(10, 2) NOT NULL,
    `preco_frete` DECIMAL(10, 2) NOT NULL,
    `preco_total` DECIMAL(10, 2) NOT NULL,
    `status_pagamento` VARCHAR(50) NULL DEFAULT 'PENDENTE',
    `id_pagamento_gateway` VARCHAR(255) NULL,
    `data_pedido` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status_entrega` VARCHAR(50) NOT NULL DEFAULT 'Pendente',
    `metodo_envio` VARCHAR(100) NULL,
    `prazo_entrega` VARCHAR(50) NULL,
    `codigo_rastreio` VARCHAR(255) NULL,
    `id_cupom_utilizado` INTEGER NULL,
    `canal_venda` VARCHAR(50) NOT NULL DEFAULT 'ecommerce',
    `gateway_provider` VARCHAR(50) NOT NULL DEFAULT 'MERCADOPAGO',
    `ifood_order_id` VARCHAR(255) NULL,
    `ifood_display_id` VARCHAR(50) NULL,
    `id_caixa_pdv` INTEGER NULL,
    `url_boleto` TEXT NULL,
    `linha_digitavel` VARCHAR(255) NULL,
    `delivery_pin` VARCHAR(10) NULL,
    `driver_token` VARCHAR(255) NULL,
    `driver_token_expires` DATETIME(0) NULL,

    UNIQUE INDEX `ifood_order_id`(`ifood_order_id`),
    UNIQUE INDEX `pedidos_driver_token_key`(`driver_token`),
    INDEX `id_endereco_entrega`(`id_endereco_entrega`),
    INDEX `id_usuario`(`id_usuario`),
    INDEX `fk_pedidos_cupom`(`id_cupom_utilizado`),
    INDEX `idx_pedidos_caixa_pdv`(`id_caixa_pdv`),
    INDEX `fk_pedidos_tenants`(`id_tenant`),
    PRIMARY KEY (`id_pedido`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produtos` (
    `id_produto` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `descricao` TEXT NULL,
    `preco` DECIMAL(10, 2) NOT NULL,
    `estoque` DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
    `imagem_url` VARCHAR(2048) NULL,
    `id_categoria` INTEGER NULL,
    `id_marca` INTEGER NULL,
    `desconto_percentual` INTEGER NOT NULL DEFAULT 0,
    `visualizacoes` INTEGER NOT NULL DEFAULT 0,
    `id_fornecedor` INTEGER NULL,
    `url_shopee_original` VARCHAR(2048) NULL,
    `peso` DECIMAL(10, 2) NOT NULL DEFAULT 0.30,
    `comprimento` DECIMAL(10, 2) NOT NULL DEFAULT 16.00,
    `altura` DECIMAL(10, 2) NOT NULL DEFAULT 2.00,
    `largura` DECIMAL(10, 2) NOT NULL DEFAULT 11.00,
    `mercado_livre_id` VARCHAR(255) NULL,
    `ml_status` VARCHAR(50) NULL DEFAULT 'Não Publicado',
    `tiktok_video_url` VARCHAR(2048) NULL,
    `tiktok_product_id` VARCHAR(255) NULL,
    `tiktok_status` VARCHAR(50) NULL DEFAULT 'Não Publicado',
    `custo` DECIMAL(10, 2) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `ml_category_id` VARCHAR(255) NULL,
    `ml_attributes` JSON NULL,
    `id_subcategoria` INTEGER NULL,
    `active_ecommerce` BOOLEAN NOT NULL DEFAULT true,
    `id_externo` VARCHAR(255) NULL,
    `preco_custo` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `ifood_id` VARCHAR(255) NULL,
    `ifood_status` VARCHAR(50) NULL DEFAULT 'AVAILABLE',
    `preco_ifood` DECIMAL(10, 2) NULL,
    `unidade` ENUM('UN', 'KG', 'G', 'M', 'CM', 'L', 'ML', 'PCT', 'CX', 'PAR', 'M2') NOT NULL DEFAULT 'UN',
    `tipo_produto` ENUM('FINAL', 'INSUMO', 'MISTO', 'CONSUMO_INTERNO') NOT NULL DEFAULT 'FINAL',
    `estoque_minimo` DECIMAL(10, 3) NULL DEFAULT 0.000,

    UNIQUE INDEX `uk_produtos_id_externo`(`id_externo`),
    UNIQUE INDEX `ifood_id`(`ifood_id`),
    INDEX `id_categoria`(`id_categoria`),
    INDEX `id_marca`(`id_marca`),
    INDEX `id_subcategoria`(`id_subcategoria`),
    INDEX `idx_produto_fornecedor`(`id_fornecedor`),
    INDEX `fk_produtos_tenants`(`id_tenant`),
    PRIMARY KEY (`id_produto`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id_usuario` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome_completo` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `hash_senha` VARCHAR(255) NOT NULL,
    `endereco_criptografado` TEXT NULL,
    `telefone_criptografado` TEXT NULL,
    `cpf_criptografado` TEXT NULL,
    `data_nascimento_criptografada` TEXT NULL,
    `data_criacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `reset_password_token` VARCHAR(255) NULL,
    `reset_password_expires` DATETIME(0) NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `role` VARCHAR(50) NOT NULL DEFAULT 'CLIENTE',
    `codigo_acesso` VARCHAR(20) NULL,
    `criado_em` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `score_reputacao` INTEGER NULL DEFAULT 50,
    `total_pedidos_pagos` INTEGER NULL DEFAULT 0,
    `is_verified` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `email`(`email`),
    UNIQUE INDEX `reset_password_token`(`reset_password_token`),
    UNIQUE INDEX `codigo_acesso_unique`(`codigo_acesso`),
    INDEX `fk_usuarios_tenants`(`id_tenant`),
    PRIMARY KEY (`id_usuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categorias` (
    `id_categoria` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `nome`(`nome`),
    PRIMARY KEY (`id_categoria`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carrossel_slides` (
    `id_slide` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `imagem_url` VARCHAR(2048) NOT NULL,
    `link_url` VARCHAR(2048) NOT NULL,
    `titulo` VARCHAR(255) NULL,
    `subtitulo` VARCHAR(255) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `ordem` INTEGER NULL DEFAULT 0,

    PRIMARY KEY (`id_slide`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `destaques_categorias` (
    `id_destaque` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `imagem_url` VARCHAR(2048) NOT NULL,
    `link_url` VARCHAR(255) NOT NULL,
    `titulo` VARCHAR(255) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `ordem` INTEGER NULL DEFAULT 0,

    PRIMARY KEY (`id_destaque`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marcas` (
    `id_marca` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `imagem_url` VARCHAR(2048) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `id_externo` VARCHAR(255) NULL,

    UNIQUE INDEX `nome`(`nome`),
    UNIQUE INDEX `uk_marcas_id_externo`(`id_externo`),
    PRIMARY KEY (`id_marca`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `chave` VARCHAR(255) NOT NULL,
    `valor` TEXT NOT NULL,

    UNIQUE INDEX `configuracoes_chave_id_tenant_key`(`chave`, `id_tenant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banners_laterais` (
    `id_banner` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `titulo` VARCHAR(255) NOT NULL,
    `imagem_url` VARCHAR(2048) NOT NULL,
    `posicao` ENUM('esquerda', 'direita') NOT NULL DEFAULT 'esquerda',
    `tipo_filtro` ENUM('categoria', 'marca', 'desconto', 'produto', 'subcategoria', 'url') NOT NULL,
    `valor_filtro` VARCHAR(255) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `link_url` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id_banner`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `avaliacoes` (
    `id_avaliacao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `id_produto` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `nota` INTEGER NOT NULL,
    `comentario` TEXT NULL,
    `data_avaliacao` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `imagem_url` VARCHAR(2048) NULL,
    `resposta_admin` TEXT NULL,
    `data_resposta` DATETIME(0) NULL,

    INDEX `id_produto`(`id_produto`),
    INDEX `id_usuario`(`id_usuario`),
    PRIMARY KEY (`id_avaliacao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracoes_frete` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `chave` VARCHAR(255) NOT NULL,
    `valor` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `configuracoes_frete_chave_id_tenant_key`(`chave`, `id_tenant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comunicados` (
    `id_comunicado` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `titulo` VARCHAR(255) NOT NULL,
    `imagem_url` VARCHAR(2048) NOT NULL,
    `link_url` VARCHAR(255) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id_comunicado`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cupons_desconto` (
    `id_cupom` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `codigo` VARCHAR(50) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `tipo_desconto` ENUM('PERCENTUAL', 'FIXO') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `data_inicio` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_validade` DATETIME(0) NOT NULL,
    `usos_maximos` INTEGER NULL,
    `usos_atuais` INTEGER NOT NULL DEFAULT 0,
    `usos_por_user` INTEGER NULL DEFAULT 1,
    `valor_minimo` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `alvo` ENUM('TOTAL_CARRINHO', 'FRETE', 'PRODUTO', 'CATEGORIA', 'SUBCATEGORIA', 'MARCA') NOT NULL DEFAULT 'TOTAL_CARRINHO',
    `id_produto_alvo` INTEGER NULL,
    `id_categoria_alvo` INTEGER NULL,
    `id_subcategoria_alvo` INTEGER NULL,
    `id_marca_alvo` INTEGER NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `codigo`(`codigo`),
    INDEX `fk_cupom_subcategoria`(`id_subcategoria_alvo`),
    INDEX `idx_cupom_categoria`(`id_categoria_alvo`),
    INDEX `idx_cupom_marca`(`id_marca_alvo`),
    INDEX `idx_cupom_produto`(`id_produto_alvo`),
    PRIMARY KEY (`id_cupom`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historico_precos` (
    `id_historico` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `preco_anterior` DECIMAL(10, 2) NOT NULL,
    `preco_novo` DECIMAL(10, 2) NOT NULL,
    `data_alteracao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_id_produto`(`id_produto`),
    PRIMARY KEY (`id_historico`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lista_desejos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `data_adicao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_lista_desejos_produto`(`id_produto`),
    UNIQUE INDEX `uk_usuario_produto`(`id_usuario`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `log_estoque` (
    `id_log` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `quantidade_anterior` DECIMAL(10, 3) NOT NULL,
    `quantidade_alterada` DECIMAL(10, 3) NOT NULL,
    `quantidade_nova` DECIMAL(10, 3) NOT NULL,
    `motivo` VARCHAR(255) NOT NULL,
    `id_usuario_responsavel` INTEGER NULL,
    `data_movimentacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_log_estoque_usuario`(`id_usuario_responsavel`),
    INDEX `idx_id_produto`(`id_produto`),
    PRIMARY KEY (`id_log`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_subimagens` (
    `id_subimagem` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(2048) NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,

    INDEX `idx_id_produto_subimagem`(`id_produto`),
    PRIMARY KEY (`id_subimagem`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DestaquesCategoria` (
    `id_destaque` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(191) NOT NULL,
    `imagem_url` VARCHAR(191) NOT NULL,
    `tipo_filtro` VARCHAR(191) NOT NULL,
    `valor_filtro` VARCHAR(191) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `ordem` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id_destaque`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metodos_envio` (
    `id_metodo` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `nome` VARCHAR(100) NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `prazo_base` VARCHAR(50) NULL,
    `valor_base` DECIMAL(10, 2) NULL,

    PRIMARY KEY (`id_metodo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regras_frete_local` (
    `id_regra` INTEGER NOT NULL AUTO_INCREMENT,
    `id_metodo` INTEGER NOT NULL,
    `cep_inicio` VARCHAR(10) NOT NULL,
    `cep_fim` VARCHAR(10) NOT NULL,
    `peso_min` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `peso_max` DECIMAL(10, 2) NOT NULL,
    `preco` DECIMAL(10, 2) NOT NULL,

    INDEX `idx_regras_frete_metodo`(`id_metodo`),
    PRIMARY KEY (`id_regra`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lojas` (
    `id_loja` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `nome` VARCHAR(255) NOT NULL,
    `cep` VARCHAR(10) NOT NULL,
    `logradouro` VARCHAR(255) NOT NULL,
    `numero` VARCHAR(20) NOT NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NOT NULL,
    `cidade` VARCHAR(100) NOT NULL,
    `estado` VARCHAR(50) NOT NULL,
    `latitude` FLOAT NULL,
    `longitude` FLOAT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criado_em` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id_loja`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subcategorias` (
    `id_subcategoria` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `id_categoria` INTEGER NOT NULL,

    INDEX `id_categoria`(`id_categoria`),
    PRIMARY KEY (`id_subcategoria`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_integracao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ativo` BOOLEAN NOT NULL DEFAULT false,
    `host` VARCHAR(255) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 1433,
    `user` VARCHAR(255) NOT NULL,
    `password` TEXT NOT NULL,
    `database` VARCHAR(255) NOT NULL,
    `tabela_origem` VARCHAR(100) NOT NULL DEFAULT 'cditem',
    `ultima_sincronizacao` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promocoes_automaticas` (
    `id_promocao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `nome` VARCHAR(255) NOT NULL,
    `tipo_desconto` ENUM('PERCENTUAL', 'FIXO') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `data_inicio` DATETIME(0) NOT NULL,
    `data_fim` DATETIME(0) NOT NULL,
    `ativo` BOOLEAN NULL DEFAULT true,
    `alvo` ENUM('TOTAL_CARRINHO', 'FRETE', 'PRODUTO', 'CATEGORIA', 'SUBCATEGORIA', 'MARCA') NOT NULL,
    `id_produto_alvo` INTEGER NULL,
    `id_categoria_alvo` INTEGER NULL,
    `id_subcategoria_alvo` INTEGER NULL,
    `id_marca_alvo` INTEGER NULL,
    `prioridade` INTEGER NULL DEFAULT 1,
    `criado_em` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_promo_categoria`(`id_categoria_alvo`),
    INDEX `fk_promo_marca`(`id_marca_alvo`),
    INDEX `fk_promo_produto`(`id_produto_alvo`),
    INDEX `fk_promo_subcategoria`(`id_subcategoria_alvo`),
    INDEX `idx_promo_ativo`(`ativo`),
    INDEX `idx_promo_datas`(`data_inicio`, `data_fim`),
    PRIMARY KEY (`id_promocao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menus_rodape` (
    `id_link` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `titulo` VARCHAR(255) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `coluna` VARCHAR(50) NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id_link`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_visualizacoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `data` DATE NOT NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,
    `id_tenant` INTEGER NOT NULL DEFAULT 1,

    INDEX `idx_data_view`(`data`),
    INDEX `fk_visualizacoes_tenant`(`id_tenant`),
    UNIQUE INDEX `uk_produto_data`(`id_produto`, `data`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fornecedores` (
    `id_fornecedor` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `nome_loja` VARCHAR(255) NOT NULL,
    `documento` VARCHAR(20) NULL,
    `shopee_loja_url` VARCHAR(2048) NULL,
    `contato_whats` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `responsavel` VARCHAR(100) NULL,
    `endereco` VARCHAR(255) NULL,
    `reputacao` FLOAT NULL DEFAULT 0,
    `prazo_medio` INTEGER NULL,
    `status` VARCHAR(20) NULL DEFAULT 'Ativo',
    `criado_em` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id_fornecedor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campanha_marketing_produtos` (
    `id_campanha` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `preco_promocional` DECIMAL(10, 2) NULL,

    INDEX `id_produto`(`id_produto`),
    PRIMARY KEY (`id_campanha`, `id_produto`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campanhas_marketing` (
    `id_campanha` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `nome` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `descricao` TEXT NULL,
    `banner_desktop` VARCHAR(2048) NULL,
    `banner_mobile` VARCHAR(2048) NULL,
    `cor_tema` VARCHAR(7) NULL DEFAULT '#0d6efd',
    `data_inicio` DATETIME(0) NOT NULL,
    `data_fim` DATETIME(0) NOT NULL,
    `ativo` BOOLEAN NULL DEFAULT true,
    `cliques` INTEGER NULL DEFAULT 0,
    `vendas_geradas` INTEGER NULL DEFAULT 0,
    `faturamento_gerado` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `imagem_url` TEXT NULL,

    UNIQUE INDEX `slug`(`slug`),
    PRIMARY KEY (`id_campanha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `chave` VARCHAR(191) NOT NULL,
    `valor` JSON NOT NULL,

    UNIQUE INDEX `SiteConfig_chave_key`(`chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsappMensagens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `remoteJid` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NULL,
    `conteudo` TEXT NOT NULL,
    `fromMe` BOOLEAN NOT NULL,
    `data_envio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lida` BOOLEAN NOT NULL DEFAULT false,
    `whatsappId` VARCHAR(255) NULL,

    UNIQUE INDEX `WhatsappMensagens_whatsappId_key`(`whatsappId`),
    INDEX `WhatsappMensagens_remoteJid_idx`(`remoteJid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsappContatos` (
    `jid` VARCHAR(255) NOT NULL,
    `id_tenant` INTEGER NULL,
    `nome` VARCHAR(255) NULL,
    `pictureUrl` VARCHAR(1024) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recado` VARCHAR(255) NULL,

    PRIMARY KEY (`jid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agendamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fim` DATETIME(3) NOT NULL,
    `observacoes` TEXT NULL,
    `clienteJid` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Agendamento_clienteJid_idx`(`clienteJid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IfoodAuth` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NULL,
    `merchantId` VARCHAR(255) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NOT NULL,
    `expiresIn` DATETIME(0) NOT NULL,
    `updatedAt` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `clientId` TEXT NULL,
    `clientSecret` TEXT NULL,

    UNIQUE INDEX `merchantId`(`merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `caixa_pdv` (
    `id_caixa` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `data_abertura` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_fechamento` DATETIME(0) NULL,
    `saldo_inicial` DECIMAL(10, 2) NOT NULL,
    `saldo_final` DECIMAL(10, 2) NULL,
    `saldo_sistema` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
    `observacoes` TEXT NULL,

    INDEX `idx_caixa_pdv_usuario`(`id_usuario`),
    INDEX `fk_caixa_tenants`(`id_tenant`),
    PRIMARY KEY (`id_caixa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimentacao_caixa` (
    `id_movimentacao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_caixa` INTEGER NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `motivo` VARCHAR(255) NULL,
    `data_hora` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_movimentacao_caixa`(`id_caixa`),
    PRIMARY KEY (`id_movimentacao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MovimentacaoEstoque` (
    `id_movimentacao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `quantidade` DECIMAL(10, 3) NOT NULL,
    `saldo_momento` DECIMAL(10, 3) NOT NULL,
    `motivo` VARCHAR(191) NOT NULL,
    `origem_destino` VARCHAR(191) NULL,
    `usuario_id` INTEGER NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MovimentacaoEstoque_id_produto_fkey`(`id_produto`),
    INDEX `fk_movimentacao_estoque_usuario`(`usuario_id`),
    PRIMARY KEY (`id_movimentacao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditoriaProduto` (
    `id_auditoria` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `acao` VARCHAR(50) NOT NULL,
    `campo_alterado` VARCHAR(100) NULL,
    `valor_antigo` TEXT NULL,
    `valor_novo` TEXT NULL,
    `data_alteracao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `id_tenant` INTEGER NOT NULL DEFAULT 1,

    INDEX `idx_auditoria_produto`(`id_produto`),
    INDEX `idx_auditoria_usuario`(`id_usuario`),
    INDEX `fk_auditoria_tenant`(`id_tenant`),
    PRIMARY KEY (`id_auditoria`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gateway_rules` (
    `method` VARCHAR(50) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `id_tenant` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`method`, `id_tenant`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transacoes_financeiras` (
    `id_transacao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `gateway_provider` VARCHAR(191) NOT NULL,
    `gateway_id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `valor_bruto` DECIMAL(10, 2) NOT NULL,
    `valor_taxa` DECIMAL(10, 2) NOT NULL,
    `valor_liquido` DECIMAL(10, 2) NOT NULL,
    `data_criacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `id_tenant` INTEGER NOT NULL DEFAULT 1,

    INDEX `fk_transacoes_pedidos`(`id_pedido`),
    INDEX `fk_transacoes_usuarios`(`id_usuario`),
    INDEX `idx_gateway_provider_id`(`gateway_provider`, `gateway_id`),
    INDEX `fk_transacoes_tenant`(`id_tenant`),
    PRIMARY KEY (`id_transacao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financeiro_baixas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `tipo` ENUM('RECEITA', 'DESPESA') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `juros` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `multa` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `desconto` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `valor_total_movimento` DECIMAL(10, 2) NOT NULL,
    `data_baixa` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `forma_pagamento` ENUM('DINHEIRO', 'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'TRANSFERENCIA', 'OUTRO') NOT NULL,
    `id_conta_pagar` INTEGER NULL,
    `id_conta_receber` INTEGER NULL,
    `id_caixa_pdv` INTEGER NULL,
    `id_transacao` INTEGER NULL,
    `criado_por` INTEGER NULL,
    `observacao` TEXT NULL,

    INDEX `fk_fb_conta_pagar`(`id_conta_pagar`),
    INDEX `fk_fb_conta_receber`(`id_conta_receber`),
    INDEX `idx_fb_data`(`data_baixa`),
    INDEX `fk_fb_caixa`(`id_caixa_pdv`),
    INDEX `fk_fb_transacao`(`id_transacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financeiro_categorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `tipo` ENUM('RECEITA', 'DESPESA') NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financeiro_contas_pagar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `id_loja` INTEGER NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `valor_total` DECIMAL(10, 2) NOT NULL,
    `valor_pago` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `saldo_restante` DECIMAL(10, 2) NOT NULL,
    `data_competencia` DATE NOT NULL,
    `data_vencimento` DATE NOT NULL,
    `data_liquidacao` DATETIME(3) NULL,
    `status` ENUM('PENDENTE', 'PARCIALMENTE_PAGO', 'PAGO', 'VENCIDO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
    `id_fornecedor` INTEGER NULL,
    `id_categoria` INTEGER NULL,
    `parcela_numero` INTEGER NULL DEFAULT 1,
    `parcela_total` INTEGER NULL DEFAULT 1,
    `grupo_uuid` VARCHAR(36) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,
    `criado_por` INTEGER NULL,

    INDEX `fk_fcp_categoria`(`id_categoria`),
    INDEX `idx_fcp_fornecedor`(`id_fornecedor`),
    INDEX `idx_fcp_status`(`status`),
    INDEX `idx_fcp_vencimento`(`data_vencimento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financeiro_contas_receber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tenant` INTEGER NOT NULL,
    `id_loja` INTEGER NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `valor_total` DECIMAL(10, 2) NOT NULL,
    `valor_recebido` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `saldo_restante` DECIMAL(10, 2) NOT NULL,
    `data_competencia` DATE NOT NULL,
    `data_vencimento` DATE NOT NULL,
    `data_liquidacao` DATETIME(3) NULL,
    `status` ENUM('PENDENTE', 'PARCIALMENTE_PAGO', 'PAGO', 'VENCIDO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
    `id_usuario` INTEGER NULL,
    `id_pedido` INTEGER NULL,
    `id_categoria` INTEGER NULL,
    `parcela_numero` INTEGER NULL DEFAULT 1,
    `parcela_total` INTEGER NULL DEFAULT 1,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `fk_fcr_categoria`(`id_categoria`),
    INDEX `idx_fcr_pedido`(`id_pedido`),
    INDEX `idx_fcr_status`(`status`),
    INDEX `idx_fcr_vencimento`(`data_vencimento`),
    INDEX `fk_fcr_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordens_producao` (
    `id_ordem` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(10, 3) NOT NULL,
    `id_usuario` INTEGER NULL,
    `data_producao` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_op_produto`(`id_produto`),
    INDEX `fk_op_usuario`(`id_usuario`),
    PRIMARY KEY (`id_ordem`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_composicao` (
    `id_composicao` INTEGER NOT NULL AUTO_INCREMENT,
    `id_produto_final` INTEGER NOT NULL,
    `id_insumo` INTEGER NOT NULL,
    `quantidade_necessaria` DECIMAL(10, 3) NOT NULL,

    INDEX `idx_insumo`(`id_insumo`),
    INDEX `idx_produto_final`(`id_produto_final`),
    PRIMARY KEY (`id_composicao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(255) NOT NULL,
    `nome_fantasia` VARCHAR(255) NOT NULL,
    `razao_social` VARCHAR(255) NULL,
    `documento` VARCHAR(20) NULL,
    `telefone_contato` VARCHAR(20) NULL,
    `email_contato` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `hash_senha` VARCHAR(255) NULL,
    `plano` VARCHAR(50) NULL DEFAULT 'TRIAL',
    `status_assinatura` VARCHAR(50) NULL DEFAULT 'ATIVO',
    `data_vencimento` DATE NULL,
    `gateway_customer_id` VARCHAR(255) NULL,
    `id_assinatura_ext` VARCHAR(255) NULL,
    `limite_produtos` INTEGER NULL DEFAULT 50,
    `limite_usuarios` INTEGER NULL DEFAULT 2,
    `ativo` BOOLEAN NULL DEFAULT true,
    `criado_em` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `dominio_customizado` VARCHAR(255) NULL,

    UNIQUE INDEX `uk_tenant_slug`(`slug`),
    UNIQUE INDEX `tenants_dominio_customizado_key`(`dominio_customizado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faturas_saas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `valor` INTEGER NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
    `external_id` VARCHAR(255) NULL,
    `pix_copia_cola` TEXT NULL,
    `url_pagamento` VARCHAR(500) NULL,
    `criado_em` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `pago_em` TIMESTAMP(0) NULL,

    UNIQUE INDEX `faturas_saas_external_id_key`(`external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `carrinhos` ADD CONSTRAINT `carrinhos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `carrinhos` ADD CONSTRAINT `carrinhos_ibfk_2` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `enderecos` ADD CONSTRAINT `enderecos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedido_items` ADD CONSTRAINT `fk_pedido_items_tenant` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_items` ADD CONSTRAINT `pedido_items_fk_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos`(`id_pedido`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `fk_pedidos_caixa_pdv` FOREIGN KEY (`id_caixa_pdv`) REFERENCES `caixa_pdv`(`id_caixa`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `fk_pedidos_cupom` FOREIGN KEY (`id_cupom_utilizado`) REFERENCES `cupons_desconto`(`id_cupom`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `fk_pedidos_tenants` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_fk_endereco` FOREIGN KEY (`id_endereco_entrega`) REFERENCES `enderecos`(`id_endereco`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_fk_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `fk_produtos_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id_fornecedor`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `fk_produtos_tenants` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `produtos_ibfk_1` FOREIGN KEY (`id_categoria`) REFERENCES `categorias`(`id_categoria`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `produtos_ibfk_2` FOREIGN KEY (`id_marca`) REFERENCES `marcas`(`id_marca`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `produtos_ibfk_subcategoria` FOREIGN KEY (`id_subcategoria`) REFERENCES `subcategorias`(`id_subcategoria`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `fk_usuarios_tenants` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `avaliacoes` ADD CONSTRAINT `avaliacoes_ibfk_1` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `avaliacoes` ADD CONSTRAINT `avaliacoes_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cupons_desconto` ADD CONSTRAINT `fk_cupom_categoria` FOREIGN KEY (`id_categoria_alvo`) REFERENCES `categorias`(`id_categoria`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cupons_desconto` ADD CONSTRAINT `fk_cupom_marca` FOREIGN KEY (`id_marca_alvo`) REFERENCES `marcas`(`id_marca`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cupons_desconto` ADD CONSTRAINT `fk_cupom_produto` FOREIGN KEY (`id_produto_alvo`) REFERENCES `produtos`(`id_produto`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `cupons_desconto` ADD CONSTRAINT `fk_cupom_subcategoria` FOREIGN KEY (`id_subcategoria_alvo`) REFERENCES `subcategorias`(`id_subcategoria`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `historico_precos` ADD CONSTRAINT `fk_historico_precos_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lista_desejos` ADD CONSTRAINT `fk_lista_desejos_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lista_desejos` ADD CONSTRAINT `fk_lista_desejos_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `log_estoque` ADD CONSTRAINT `fk_log_estoque_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `log_estoque` ADD CONSTRAINT `fk_log_estoque_usuario` FOREIGN KEY (`id_usuario_responsavel`) REFERENCES `usuarios`(`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produto_subimagens` ADD CONSTRAINT `fk_produto_subimagens_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `regras_frete_local` ADD CONSTRAINT `fk_regras_frete_metodo` FOREIGN KEY (`id_metodo`) REFERENCES `metodos_envio`(`id_metodo`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `subcategorias` ADD CONSTRAINT `subcategorias_ibfk_1` FOREIGN KEY (`id_categoria`) REFERENCES `categorias`(`id_categoria`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `promocoes_automaticas` ADD CONSTRAINT `fk_promo_categoria` FOREIGN KEY (`id_categoria_alvo`) REFERENCES `categorias`(`id_categoria`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `promocoes_automaticas` ADD CONSTRAINT `fk_promo_marca` FOREIGN KEY (`id_marca_alvo`) REFERENCES `marcas`(`id_marca`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `promocoes_automaticas` ADD CONSTRAINT `fk_promo_produto` FOREIGN KEY (`id_produto_alvo`) REFERENCES `produtos`(`id_produto`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `promocoes_automaticas` ADD CONSTRAINT `fk_promo_subcategoria` FOREIGN KEY (`id_subcategoria_alvo`) REFERENCES `subcategorias`(`id_subcategoria`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produto_visualizacoes` ADD CONSTRAINT `fk_produto_visualizacoes_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produto_visualizacoes` ADD CONSTRAINT `fk_visualizacoes_tenant` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campanha_marketing_produtos` ADD CONSTRAINT `campanha_marketing_produtos_ibfk_1` FOREIGN KEY (`id_campanha`) REFERENCES `campanhas_marketing`(`id_campanha`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `campanha_marketing_produtos` ADD CONSTRAINT `campanha_marketing_produtos_ibfk_2` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Agendamento` ADD CONSTRAINT `Agendamento_clienteJid_fkey` FOREIGN KEY (`clienteJid`) REFERENCES `WhatsappContatos`(`jid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `caixa_pdv` ADD CONSTRAINT `fk_caixa_pdv_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `caixa_pdv` ADD CONSTRAINT `fk_caixa_tenants` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `movimentacao_caixa` ADD CONSTRAINT `fk_movimentacao_caixa` FOREIGN KEY (`id_caixa`) REFERENCES `caixa_pdv`(`id_caixa`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovimentacaoEstoque` ADD CONSTRAINT `MovimentacaoEstoque_id_produto_fkey` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovimentacaoEstoque` ADD CONSTRAINT `fk_movimentacao_estoque_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `AuditoriaProduto` ADD CONSTRAINT `fk_auditoria_produtos` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `AuditoriaProduto` ADD CONSTRAINT `fk_auditoria_tenant` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditoriaProduto` ADD CONSTRAINT `fk_auditoria_usuarios` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transacoes_financeiras` ADD CONSTRAINT `fk_transacoes_pedidos` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos`(`id_pedido`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transacoes_financeiras` ADD CONSTRAINT `fk_transacoes_tenant` FOREIGN KEY (`id_tenant`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transacoes_financeiras` ADD CONSTRAINT `fk_transacoes_usuarios` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_baixas` ADD CONSTRAINT `fk_fb_caixa` FOREIGN KEY (`id_caixa_pdv`) REFERENCES `caixa_pdv`(`id_caixa`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_baixas` ADD CONSTRAINT `fk_fb_conta_pagar` FOREIGN KEY (`id_conta_pagar`) REFERENCES `financeiro_contas_pagar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_baixas` ADD CONSTRAINT `fk_fb_conta_receber` FOREIGN KEY (`id_conta_receber`) REFERENCES `financeiro_contas_receber`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_baixas` ADD CONSTRAINT `fk_fb_transacao` FOREIGN KEY (`id_transacao`) REFERENCES `transacoes_financeiras`(`id_transacao`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_contas_pagar` ADD CONSTRAINT `fk_fcp_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `financeiro_categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_contas_pagar` ADD CONSTRAINT `fk_fcp_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id_fornecedor`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_contas_receber` ADD CONSTRAINT `fk_fcr_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `financeiro_categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_contas_receber` ADD CONSTRAINT `fk_fcr_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos`(`id_pedido`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financeiro_contas_receber` ADD CONSTRAINT `fk_fcr_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordens_producao` ADD CONSTRAINT `fk_op_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id_produto`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordens_producao` ADD CONSTRAINT `fk_op_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `produto_composicao` ADD CONSTRAINT `fk_composicao_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_composicao` ADD CONSTRAINT `fk_composicao_produto_final` FOREIGN KEY (`id_produto_final`) REFERENCES `produtos`(`id_produto`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faturas_saas` ADD CONSTRAINT `faturas_saas_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
