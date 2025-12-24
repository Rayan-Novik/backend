-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Tempo de geração: 12/09/2025 às 06:00
-- Versão do servidor: 8.0.43
-- Versão do PHP: 8.2.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `ecommerce_db`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `avaliacoes`
--

CREATE TABLE `avaliacoes` (
  `id_avaliacao` int NOT NULL,
  `id_produto` int NOT NULL,
  `id_usuario` int NOT NULL,
  `nota` int NOT NULL,
  `comentario` text,
  `data_avaliacao` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `avaliacoes`
--

INSERT INTO `avaliacoes` (`id_avaliacao`, `id_produto`, `id_usuario`, `nota`, `comentario`, `data_avaliacao`) VALUES
(1, 11, 7, 4, 'teste', '2025-08-26 23:38:01'),
(2, 1, 7, 5, 'Muito bom', '2025-08-26 23:51:07'),
(3, 4, 7, 1, 'muito otimo', '2025-08-27 21:22:36'),
(4, 1, 8, 5, 'sdf', '2025-09-07 02:41:52');

-- --------------------------------------------------------

--
-- Estrutura para tabela `banners_laterais`
--

CREATE TABLE `banners_laterais` (
  `id_banner` int NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `imagem_url` varchar(2048) NOT NULL,
  `posicao` enum('esquerda','direita') NOT NULL DEFAULT 'esquerda',
  `tipo_filtro` enum('categoria','marca','desconto') NOT NULL,
  `valor_filtro` varchar(255) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `link_url` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `banners_laterais`
--

INSERT INTO `banners_laterais` (`id_banner`, `titulo`, `imagem_url`, `posicao`, `tipo_filtro`, `valor_filtro`, `ativo`, `link_url`) VALUES
(1, 'notebooks', 'https://firebasestorage.googleapis.com/v0/b/a7-pool-eletrica.appspot.com/o/site%2Fbanners%2FDESCONTAO1.png?alt=media&token=551b1dc4-20fe-49d0-8d74-a9802d56eff2', 'direita', 'categoria', 'notebooks', 0, ''),
(2, 'Apple', 'https://firebasestorage.googleapis.com/v0/b/a7-pool-eletrica.appspot.com/o/site%2Fbanners%2FDESCONTAO1.png?alt=media&token=551b1dc4-20fe-49d0-8d74-a9802d56eff2', 'esquerda', 'marca', 'apple', 1, '');

-- --------------------------------------------------------

--
-- Estrutura para tabela `carrinhos`
--

CREATE TABLE `carrinhos` (
  `id_carrinho` int NOT NULL,
  `id_usuario` int NOT NULL,
  `id_produto` int NOT NULL,
  `quantidade` int NOT NULL,
  `data_adicionado` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `carrossel_slides`
--

CREATE TABLE `carrossel_slides` (
  `id_slide` int NOT NULL,
  `imagem_url` varchar(2048) NOT NULL,
  `link_url` varchar(2048) NOT NULL,
  `titulo` varchar(255) DEFAULT NULL,
  `subtitulo` varchar(255) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `ordem` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `carrossel_slides`
--

INSERT INTO `carrossel_slides` (`id_slide`, `imagem_url`, `link_url`, `titulo`, `subtitulo`, `ativo`, `ordem`) VALUES
(1, 'https://firebasestorage.googleapis.com/v0/b/a7-pool-eletrica.appspot.com/o/site%2Fbanners%2Fban01.png?alt=media&token=d5848cba-3269-4314-b356-d7cbdfc86977', '/categoria/notebooks', '', '', 1, 0),
(2, 'https://firebasestorage.googleapis.com/v0/b/a7-pool-eletrica.appspot.com/o/site%2Fbanners%2FtesteBanner03.png?alt=media&token=9af79878-686f-42dd-8fdb-f34d82478525', '/categoria/Acessórios', '', '', 1, 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `categorias`
--

CREATE TABLE `categorias` (
  `id_categoria` int NOT NULL,
  `nome` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `categorias`
--

INSERT INTO `categorias` (`id_categoria`, `nome`) VALUES
(4, 'Acessórios'),
(1, 'Notebooks'),
(2, 'Smartphones'),
(3, 'Teclados');

-- --------------------------------------------------------

--
-- Estrutura para tabela `comunicados`
--

CREATE TABLE `comunicados` (
  `id_comunicado` int NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `imagem_url` varchar(2048) NOT NULL,
  `link_url` varchar(255) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `comunicados`
--

INSERT INTO `comunicados` (`id_comunicado`, `titulo`, `imagem_url`, `link_url`, `ativo`) VALUES
(2, 'notebooks', 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500', '/categoria/notebooks', 1);

-- --------------------------------------------------------

--
-- Estrutura para tabela `configuracoes`
--

CREATE TABLE `configuracoes` (
  `id` int NOT NULL,
  `chave` varchar(255) NOT NULL,
  `valor` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `configuracoes`
--

INSERT INTO `configuracoes` (`id`, `chave`, `valor`) VALUES
(1, 'HEADER_COLOR', '95c3646928e50f08503d0e6d1f4259fa'),
(2, 'FOOTER_COLOR', 'f4ac05e6e0b06a9645ca1cb91826f581'),
(3, 'LOGO_URL', '2504f88cf9240c77647dfacbf8807b30e38ebf11643c1bb8237cd27309b7f833c97636fb0c53fdcc8d461161fee48e01'),
(19, 'HEADER_PRIMARY_COLOR', '95c3646928e50f08503d0e6d1f4259fa'),
(20, 'HEADER_SECONDARY_COLOR', 'f4ac05e6e0b06a9645ca1cb91826f581'),
(107, 'MERCADO_LIVRE_ACCESS_TOKEN', '2ae0da3a03d84800a497551e2c9191a3221e7594a0da9793ca9ad7d3e0e00e49448aef581ebcd654ca9b21111db0b126fae6ba9a48e3614f9b9a5df76e744cff13b089b8cb20834903a3a6995d6dd435'),
(109, 'MERCADO_LIVRE_REFRESH_TOKEN', '9b2e3aad921c87c506bfee325af374ee92b991690782e9f5c3ac386dbc667027dc191b886a0b8ddfc09936adb5af6d79'),
(112, 'MERCADO_LIVRE_APP_ID', '8de340aaa4d8fa446ba5ad093d1191c3775e41ac6d82fc390f5746e0be89c844'),
(113, 'MERCADO_LIVRE_SECRET_KEY', '723a8dd39e017786c760295c47df8a38d53c92bb1122375f12d641932996850a0cd5a5960bc001864f2b50f5ddc0c530'),
(132, 'TIKTOK_APP_KEY', ''),
(133, 'TIKTOK_APP_SECRET', ''),
(134, 'TIKTOK_ACCESS_TOKEN', ''),
(135, 'TIKTOK_REFRESH_TOKEN', ''),
(136, 'TIKTOK_SHOP_ID', ''),
(137, 'RECOMENDACOES_ATIVO', 'true'),
(142, 'SITE_TITLE', '85aadf2c5998057976e1c7338ff828f9'),
(143, 'FAVICON_URL', 'b553120e76a5819d82036159749cd1c8ad3451cc19f5aecf729d03fa9a669bf4');

-- --------------------------------------------------------

--
-- Estrutura para tabela `configuracoes_frete`
--

CREATE TABLE `configuracoes_frete` (
  `id` int NOT NULL,
  `chave` varchar(255) NOT NULL,
  `valor` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `configuracoes_frete`
--

INSERT INTO `configuracoes_frete` (`id`, `chave`, `valor`) VALUES
(1, 'CEP_ORIGEM', '69050-025'),
(2, 'VALOR_MINIMO_FRETE_GRATIS', '200'),
(3, 'CUSTO_FRETE_LOCAL', '0'),
(4, 'CUSTO_FRETE_NACIONAL_FIXO', '45.50'),
(5, 'VALOR_MINIMO_FRETE_GRATIS_LOCAL', '0'),
(6, 'VALOR_MINIMO_FRETE_GRATIS_NACIONAL', '0'),
(7, 'TIPO_CALCULO_NACIONAL', 'AUTOMATICO'),
(9, 'TIPO_CALCULO_LOCAL', 'FIXO'),
(10, 'MERCADO_LIVRE_ACCESS_TOKEN', 'APP_USR-7077559926815831-082900-2673424f79de3edb1cc15baf461e5b07-1251661537');

-- --------------------------------------------------------

--
-- Estrutura para tabela `cupons_desconto`
--

CREATE TABLE `cupons_desconto` (
  `id_cupom` int NOT NULL,
  `codigo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_desconto` enum('PERCENTUAL','FIXO') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `data_validade` datetime NOT NULL,
  `usos_maximos` int DEFAULT NULL,
  `usos_atuais` int NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `destaques_categorias`
--

CREATE TABLE `destaques_categorias` (
  `id_destaque` int NOT NULL,
  `imagem_url` varchar(2048) NOT NULL,
  `link_url` varchar(255) NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `ordem` int DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `destaques_categorias`
--

INSERT INTO `destaques_categorias` (`id_destaque`, `imagem_url`, `link_url`, `titulo`, `ativo`, `ordem`) VALUES
(1, 'https://static.vecteezy.com/ti/vetor-gratis/p1/21496289-dell-marca-logotipo-computador-simbolo-nome-preto-projeto-eua-computador-portatil-ilustracao-gratis-vetor.jpg', '/marca/Dell', 'notebooks', 1, 0),
(2, 'https://cdn-icons-png.flaticon.com/512/0/747.png', '/marca/Apple', 'Apple', 1, 0),
(3, 'https://pngimg.com/d/samsung_logo_PNG5.png', '/marca/samsung', 'Samsung', 1, 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `enderecos`
--

CREATE TABLE `enderecos` (
  `id_endereco` int NOT NULL,
  `id_usuario` int NOT NULL,
  `cep` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  `logradouro` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `numero` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `complemento` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `bairro` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `cidade` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `estado` varchar(2) COLLATE utf8mb4_general_ci NOT NULL,
  `is_principal` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `enderecos`
--

INSERT INTO `enderecos` (`id_endereco`, `id_usuario`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `is_principal`) VALUES
(3, 7, '69088483', 'Jorge Texeira', '2', '', 'Jorge Teixeira', 'Manaus', 'AM', 0),
(4, 8, '69088483', 'Jorge Texeira', '2', '', 'Jorge Teixeira', 'Manaus', 'AM', 0),
(5, 8, '69088483', 'Jorge Texeira', '2', '', 'Jorge Teixeira', 'Manaus', 'AM', 0),
(6, 7, '30441-086', 'Rua Almirante Tamandaré', '642-760', NULL, 'Gutierrez', 'Belo Horizonte', 'MG', 0),
(7, 7, '88062-600', 'Avenida Prefeito Acácio Garibaldi S. Thiago', '438-550', NULL, 'Lagoa da Conceição', 'Florianópolis', 'SC', 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `historico_precos`
--

CREATE TABLE `historico_precos` (
  `id_historico` int NOT NULL,
  `id_produto` int NOT NULL,
  `preco_anterior` decimal(10,2) NOT NULL,
  `preco_novo` decimal(10,2) NOT NULL,
  `data_alteracao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `lista_desejos`
--

CREATE TABLE `lista_desejos` (
  `id` int NOT NULL,
  `id_usuario` int NOT NULL,
  `id_produto` int NOT NULL,
  `data_adicao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `log_estoque`
--

CREATE TABLE `log_estoque` (
  `id_log` int NOT NULL,
  `id_produto` int NOT NULL,
  `quantidade_anterior` int NOT NULL,
  `quantidade_alterada` int NOT NULL COMMENT 'Valor positivo para entrada, negativo para saída',
  `quantidade_nova` int NOT NULL,
  `motivo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Ex: Venda Pedido #123, Ajuste Manual, etc.',
  `id_usuario_responsavel` int DEFAULT NULL COMMENT 'ID do admin que fez ajuste manual',
  `data_movimentacao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `marcas`
--

CREATE TABLE `marcas` (
  `id_marca` int NOT NULL,
  `nome` varchar(255) NOT NULL,
  `imagem_url` varchar(2048) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Despejando dados para a tabela `marcas`
--

INSERT INTO `marcas` (`id_marca`, `nome`, `imagem_url`, `ativo`) VALUES
(1, 'Samsung', 'https://images.samsung.com/is/image/samsung/assets/global/about-us/brand/logo/360_197_1.png?$FB_TYPE_B_PNG$', 1),
(2, 'Apple', 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg', 1),
(3, 'Dell', 'https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg', 1),
(4, 'LG', 'https://upload.wikimedia.org/wikipedia/commons/5/5a/LG_logo_%282014%29.svg', 1);

-- --------------------------------------------------------

--
-- Estrutura para tabela `pedidos`
--

CREATE TABLE `pedidos` (
  `id_pedido` int NOT NULL,
  `id_usuario` int NOT NULL,
  `id_endereco_entrega` int NOT NULL,
  `metodo_pagamento` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `preco_itens` decimal(10,2) NOT NULL,
  `preco_frete` decimal(10,2) NOT NULL,
  `preco_total` decimal(10,2) NOT NULL,
  `status_pagamento` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'PENDENTE',
  `id_pagamento_gateway` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `data_pedido` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_entrega` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Pendente',
  `id_cupom_utilizado` int DEFAULT NULL,
  `canal_venda` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'ecommerce'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `pedidos`
--

INSERT INTO `pedidos` (`id_pedido`, `id_usuario`, `id_endereco_entrega`, `metodo_pagamento`, `preco_itens`, `preco_frete`, `preco_total`, `status_pagamento`, `id_pagamento_gateway`, `data_pedido`, `status_entrega`, `id_cupom_utilizado`, `canal_venda`) VALUES
(1, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 05:45:10', 'Pendente', NULL, 'ecommerce'),
(2, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 05:45:10', 'Pendente', NULL, 'ecommerce'),
(3, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 05:52:09', 'Pendente', NULL, 'ecommerce'),
(4, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 05:52:09', 'Pendente', NULL, 'ecommerce'),
(6, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 05:52:36', 'Pendente', NULL, 'ecommerce'),
(7, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 05:55:37', 'Pendente', NULL, 'ecommerce'),
(8, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 05:55:37', 'Pendente', NULL, 'ecommerce'),
(9, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 05:56:14', 'Pendente', NULL, 'ecommerce'),
(10, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 05:56:14', 'Pendente', NULL, 'ecommerce'),
(11, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:23:57', 'Pendente', NULL, 'ecommerce'),
(12, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:23:57', 'Pendente', NULL, 'ecommerce'),
(13, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:26:44', 'Pendente', NULL, 'ecommerce'),
(14, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:26:44', 'Pendente', NULL, 'ecommerce'),
(15, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:27:50', 'Pendente', NULL, 'ecommerce'),
(16, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:27:50', 'Pendente', NULL, 'ecommerce'),
(17, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:30:22', 'Pendente', NULL, 'ecommerce'),
(18, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:30:22', 'Pendente', NULL, 'ecommerce'),
(19, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:30:55', 'Pendente', NULL, 'ecommerce'),
(20, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:30:55', 'Pendente', NULL, 'ecommerce'),
(21, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 06:31:57', 'Pendente', NULL, 'ecommerce'),
(22, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 06:31:57', 'Pendente', NULL, 'ecommerce'),
(23, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:32:41', 'Pendente', NULL, 'ecommerce'),
(24, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:32:41', 'Pendente', NULL, 'ecommerce'),
(26, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:34:05', 'Pendente', NULL, 'ecommerce'),
(27, 7, 3, 'MercadoPago', 7499.99, 0.00, 7499.99, 'PENDENTE', NULL, '2025-08-20 06:35:21', 'Pendente', NULL, 'ecommerce'),
(28, 7, 3, 'MercadoPago', 7499.99, 0.00, 7499.99, 'PENDENTE', NULL, '2025-08-20 06:35:21', 'Pendente', NULL, 'ecommerce'),
(29, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:37:07', 'Pendente', NULL, 'ecommerce'),
(30, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:37:07', 'Pendente', NULL, 'ecommerce'),
(31, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:38:35', 'Pendente', NULL, 'ecommerce'),
(32, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:38:36', 'Pendente', NULL, 'ecommerce'),
(33, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:39:25', 'Pendente', NULL, 'ecommerce'),
(34, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:39:25', 'Pendente', NULL, 'ecommerce'),
(35, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:42:06', 'Pendente', NULL, 'ecommerce'),
(36, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:42:06', 'Pendente', NULL, 'ecommerce'),
(37, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:43:50', 'Pendente', NULL, 'ecommerce'),
(38, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:43:50', 'Pendente', NULL, 'ecommerce'),
(39, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:44:55', 'Pendente', NULL, 'ecommerce'),
(40, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:44:55', 'Pendente', NULL, 'ecommerce'),
(41, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:47:10', 'Pendente', NULL, 'ecommerce'),
(42, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:47:10', 'Pendente', NULL, 'ecommerce'),
(43, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:48:46', 'Pendente', NULL, 'ecommerce'),
(44, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:51:19', 'Pendente', NULL, 'ecommerce'),
(45, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:53:19', 'Pendente', NULL, 'ecommerce'),
(46, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:54:17', 'Pendente', NULL, 'ecommerce'),
(47, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:54:17', 'Pendente', NULL, 'ecommerce'),
(48, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 06:55:05', 'Pendente', NULL, 'ecommerce'),
(49, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 06:55:05', 'Pendente', NULL, 'ecommerce'),
(50, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:56:47', 'Pendente', NULL, 'ecommerce'),
(51, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 06:56:47', 'Pendente', NULL, 'ecommerce'),
(52, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:57:41', 'Pendente', NULL, 'ecommerce'),
(53, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:57:41', 'Pendente', NULL, 'ecommerce'),
(54, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:59:03', 'Pendente', NULL, 'ecommerce'),
(55, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 06:59:03', 'Pendente', NULL, 'ecommerce'),
(56, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:00:47', 'Pendente', NULL, 'ecommerce'),
(57, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:00:47', 'Pendente', NULL, 'ecommerce'),
(58, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 07:04:54', 'Pendente', NULL, 'ecommerce'),
(59, 7, 3, 'MercadoPago', 0.10, 0.00, 0.10, 'PENDENTE', NULL, '2025-08-20 07:04:54', 'Pendente', NULL, 'ecommerce'),
(60, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:09:05', 'Pendente', NULL, 'ecommerce'),
(61, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:09:05', 'Pendente', NULL, 'ecommerce'),
(62, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:09:22', 'Pendente', NULL, 'ecommerce'),
(63, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:09:22', 'Pendente', NULL, 'ecommerce'),
(64, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:10:51', 'Pendente', NULL, 'ecommerce'),
(65, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:10:51', 'Pendente', NULL, 'ecommerce'),
(66, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 07:13:09', 'Pendente', NULL, 'ecommerce'),
(67, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 07:13:09', 'Pendente', NULL, 'ecommerce'),
(68, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 07:15:39', 'Pendente', NULL, 'ecommerce'),
(69, 7, 3, 'MercadoPago', 349.90, 0.00, 349.90, 'PENDENTE', NULL, '2025-08-20 07:15:39', 'Pendente', NULL, 'ecommerce'),
(70, 7, 3, 'MercadoPago', 6349.40, 0.00, 6349.40, 'PENDENTE', NULL, '2025-08-20 07:27:05', 'Pendente', NULL, 'ecommerce'),
(71, 7, 3, 'MercadoPago', 6349.40, 0.00, 6349.40, 'PENDENTE', NULL, '2025-08-20 07:27:05', 'Pendente', NULL, 'ecommerce'),
(72, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:31:31', 'Pendente', NULL, 'ecommerce'),
(73, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:31:31', 'Pendente', NULL, 'ecommerce'),
(74, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:32:44', 'Pendente', NULL, 'ecommerce'),
(75, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:32:44', 'Pendente', NULL, 'ecommerce'),
(76, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:35:17', 'Pendente', NULL, 'ecommerce'),
(77, 7, 3, 'MercadoPago', 5999.50, 0.00, 5999.50, 'PENDENTE', NULL, '2025-08-20 07:35:17', 'Pendente', NULL, 'ecommerce'),
(79, 7, 3, 'pix', 7499.99, 0.00, 7499.99, 'PENDENTE', '1324507950', '2025-08-22 03:55:43', 'Pendente', NULL, 'ecommerce'),
(80, 7, 3, 'pix', 349.90, 0.00, 349.90, 'PENDENTE', '1324506108', '2025-08-22 03:59:37', 'Pendente', NULL, 'ecommerce'),
(136, 7, 3, 'pix', 7499.99, 0.00, 7499.99, 'PENDENTE', '123778411968', '2025-08-26 21:08:54', 'Pendente', NULL, 'ecommerce'),
(137, 7, 3, 'pix', 5000.00, 0.00, 5000.00, 'PENDENTE', '123798362470', '2025-08-26 23:42:37', 'Pendente', NULL, 'ecommerce'),
(138, 7, 3, 'pix', 7000.00, 0.00, 7000.00, 'PENDENTE', '123264637923', '2025-08-27 00:47:20', 'Pendente', NULL, 'ecommerce'),
(139, 7, 3, 'pix', 1.00, 25.00, 26.00, 'PENDENTE', '123804885510', '2025-08-27 01:04:23', 'Pendente', NULL, 'ecommerce'),
(140, 7, 3, 'pix', 0.20, 25.00, 25.20, 'PENDENTE', '123274964679', '2025-08-27 03:30:18', 'Pendente', NULL, 'ecommerce'),
(141, 7, 3, 'pix', 249.00, 25.00, 274.00, 'PENDENTE', '123275234837', '2025-08-27 03:39:16', 'Pendente', NULL, 'ecommerce'),
(142, 7, 3, 'pix', 249.00, 50.00, 299.00, 'PENDENTE', '123274871259', '2025-08-27 03:45:14', 'Pendente', NULL, 'ecommerce'),
(143, 7, 3, 'pix', 0.10, 0.00, 0.10, 'PENDENTE', '123275351341', '2025-08-27 03:55:41', 'Pendente', NULL, 'ecommerce'),
(144, 7, 6, 'pix', 0.10, 0.00, 0.10, 'PENDENTE', '123816466118', '2025-08-27 04:11:58', 'Pendente', NULL, 'ecommerce'),
(145, 7, 6, 'pix', 251.00, 0.00, 251.00, 'PENDENTE', '123816266270', '2025-08-27 04:12:41', 'Pendente', NULL, 'ecommerce'),
(146, 7, 3, 'pix', 0.10, 50.00, 50.10, 'PENDENTE', '123816366338', '2025-08-27 04:16:08', 'Pendente', NULL, 'ecommerce'),
(148, 7, 7, 'pix', 5999.60, 0.00, 5999.60, 'PENDENTE', '123900847752', '2025-08-27 20:32:10', 'Pendente', NULL, 'ecommerce'),
(149, 7, 7, 'pix', 0.10, 10.00, 10.10, 'PENDENTE', '123901247706', '2025-08-27 20:34:29', 'Pendente', NULL, 'ecommerce'),
(150, 7, 3, 'pix', 0.10, 10.00, 10.10, 'CANCELADO', '123901559550', '2025-08-27 20:35:52', 'Pendente', NULL, 'ecommerce'),
(151, 7, 3, 'pix', 0.10, 10.00, 10.10, 'CANCELADO', '123363356293', '2025-08-27 20:37:08', 'Pendente', NULL, 'ecommerce'),
(152, 7, 3, 'pix', 0.10, 10.00, 10.10, 'CANCELADO', '123362949373', '2025-08-27 20:45:51', 'Pendente', NULL, 'ecommerce'),
(153, 7, 3, 'pix', 0.10, 10.00, 10.10, 'CANCELADO', '123363737441', '2025-08-27 20:52:59', 'Pendente', NULL, 'ecommerce'),
(154, 7, 3, 'pix', 50.10, 0.00, 50.10, 'CANCELADO', '123367499027', '2025-08-27 21:17:48', 'Pendente', NULL, 'ecommerce'),
(155, 7, 3, 'pix', 40000.00, 0.00, 40000.00, 'CANCELADO', '123368344971', '2025-08-27 21:22:56', 'Pendente', NULL, 'ecommerce'),
(156, 7, 3, 'pix', 0.10, 0.00, 0.10, 'PAGO', '123399098489', '2025-08-28 02:26:14', 'Enviado', NULL, 'ecommerce'),
(157, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '123399060647', '2025-08-28 02:29:41', 'Pendente', NULL, 'ecommerce'),
(158, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '123398858919', '2025-08-28 02:32:36', 'Pendente', NULL, 'ecommerce'),
(159, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '123398091791', '2025-08-28 02:36:58', 'Pendente', NULL, 'ecommerce'),
(160, 7, 3, 'pix', 1.00, 0.00, 1.00, 'CANCELADO', '123940341636', '2025-08-28 03:18:18', 'Pendente', NULL, 'ecommerce'),
(161, 7, 7, 'pix', 0.10, 45.50, 45.60, 'CANCELADO', '124028327052', '2025-08-28 21:13:59', 'Pendente', NULL, 'ecommerce'),
(162, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '124297389669', '2025-09-04 14:30:07', 'Pendente', NULL, 'ecommerce'),
(163, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '124300356377', '2025-09-04 14:40:34', 'Pendente', NULL, 'ecommerce'),
(164, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '124847994384', '2025-09-04 15:02:15', 'Pendente', NULL, 'ecommerce'),
(165, 7, 3, 'master', 1.00, 0.00, 1.00, 'REJEITADO', '124302323511', '2025-09-04 15:07:31', 'Pendente', NULL, 'ecommerce'),
(166, 7, 3, 'master', 1.00, 0.00, 1.00, 'PAGO', '1340936451', '2025-09-04 15:14:57', 'Enviado', NULL, 'ecommerce'),
(167, 7, 3, 'pix', 1.00, 0.00, 1.00, 'PENDENTE', '1324651500', '2025-09-04 15:16:00', 'Pendente', NULL, 'ecommerce'),
(168, 8, 4, 'pix', 500.00, 0.00, 500.00, 'PENDENTE', '1340968551', '2025-09-05 20:15:23', 'Pendente', NULL, 'ecommerce'),
(169, 8, 4, 'pix', 500.00, 0.00, 500.00, 'PENDENTE', '1324669786', '2025-09-05 20:23:53', 'Pendente', NULL, 'ecommerce'),
(170, 8, 4, 'pix', 500.00, 0.00, 500.00, 'PENDENTE', '1324669834', '2025-09-05 20:26:27', 'Pendente', NULL, 'ecommerce'),
(171, 8, 4, 'pix', 500.00, 0.00, 500.00, 'PENDENTE', '1324669886', '2025-09-05 20:28:49', 'Pendente', NULL, 'ecommerce'),
(172, 8, 4, 'pix', 1.00, 0.00, 1.00, 'PAGO', '125189345326', '2025-09-06 23:03:39', 'Pendente', NULL, 'ecommerce'),
(173, 7, 3, 'master', 1.00, 0.00, 1.00, 'PAGO', '125190171298', '2025-09-06 23:09:55', 'Pendente', NULL, 'ecommerce'),
(174, 8, 4, 'pix', 13500.49, 0.00, 13500.49, 'CANCELADO', '124724734467', '2025-09-07 19:19:58', 'Pendente', NULL, 'ecommerce');

-- --------------------------------------------------------

--
-- Estrutura para tabela `pedido_items`
--

CREATE TABLE `pedido_items` (
  `id_item` int NOT NULL,
  `id_pedido` int NOT NULL,
  `id_produto` int DEFAULT NULL,
  `nome` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `quantidade` int NOT NULL,
  `preco` decimal(10,2) NOT NULL,
  `imagem_url` varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `pedido_items`
--

INSERT INTO `pedido_items` (`id_item`, `id_pedido`, `id_produto`, `nome`, `quantidade`, `preco`, `imagem_url`) VALUES
(1, 1, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(2, 2, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(3, 3, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(4, 4, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(6, 6, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(7, 7, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(8, 8, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(9, 9, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(10, 10, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(11, 12, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(12, 11, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(13, 13, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(14, 14, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(15, 15, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(16, 16, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(17, 17, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(18, 18, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(19, 19, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(20, 20, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(21, 21, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(22, 22, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(23, 23, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(24, 24, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(26, 26, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(27, 27, 1, 'Notebook Gamer Pro', 1, 7499.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(28, 28, 1, 'Notebook Gamer Pro', 1, 7499.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(29, 30, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(30, 29, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(31, 31, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(32, 32, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(33, 34, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(34, 33, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(35, 35, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(36, 36, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(37, 37, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(38, 38, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(39, 39, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(40, 40, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(41, 41, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(42, 42, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(43, 43, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(44, 44, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(45, 45, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(46, 46, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(47, 47, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(48, 48, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(49, 49, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(50, 50, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(51, 51, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(52, 52, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(53, 53, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(54, 54, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(55, 55, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(56, 56, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(57, 57, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(58, 58, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(59, 59, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://via.placeholder.com/150'),
(60, 60, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(61, 61, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(62, 62, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(63, 63, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(64, 64, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(65, 65, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(66, 66, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(67, 67, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(68, 69, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(69, 68, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(70, 70, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(71, 70, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(72, 71, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(73, 71, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(74, 72, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(75, 73, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(76, 75, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(77, 74, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(78, 76, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(79, 77, 2, 'Smartphone Galaxy S25', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(81, 79, 1, 'Notebook Gamer Pro', 1, 7499.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(82, 80, 3, 'Teclado Mecânico RGB', 1, 349.90, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500'),
(138, 136, 1, 'Notebook Gamer Pro', 1, 7499.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(139, 137, 11, ' Notebook Gamer G15-5525 com Processador AMD Ryzen', 1, 5000.00, 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/g-series/g15-5525/pdp/laptop-g-series-15-5525-pdp-hero-bk-coralkb.psd?qlt=95&fit=constrain,1&hei=400&wid=570&fmt=jpg'),
(140, 138, 10, 'perfume cheiroso', 10, 200.00, 'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dwa1988708/Produtos/PRODUTO/NATBRA-76425_2.jpg'),
(141, 138, 11, ' Notebook Gamer G15-5525 com Processador AMD Ryzen', 1, 5000.00, 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/g-series/g15-5525/pdp/laptop-g-series-15-5525-pdp-hero-bk-coralkb.psd?qlt=95&fit=constrain,1&hei=400&wid=570&fmt=jpg'),
(142, 139, 10, 'perfume cheiroso', 1, 1.00, 'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dwa1988708/Produtos/PRODUTO/NATBRA-76425_2.jpg'),
(143, 140, 4, 'Produto de Teste (10 Centavos)', 2, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(144, 141, 4, 'Produto de Teste (10 Centavos)', 1, 249.00, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(145, 142, 4, 'Produto de Teste (10 Centavos)', 1, 249.00, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(146, 143, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(147, 144, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(148, 145, 10, 'perfume cheiroso', 1, 251.00, 'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dwa1988708/Produtos/PRODUTO/NATBRA-76425_2.jpg'),
(149, 146, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(151, 148, 2, 'Iphone 14 Pro Max', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(152, 148, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(153, 149, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(154, 150, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(155, 151, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(156, 152, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(157, 153, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(158, 154, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(159, 154, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 50.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(160, 155, 11, ' Notebook Gamer G15-5525 com Processador AMD Ryzen', 8, 5000.00, 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/g-series/g15-5525/pdp/laptop-g-series-15-5525-pdp-hero-bk-coralkb.psd?qlt=95&fit=constrain,1&hei=400&wid=570&fmt=jpg'),
(161, 156, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(162, 157, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(163, 158, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(164, 159, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(165, 160, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(166, 161, 4, 'Produto de Teste (10 Centavos)', 1, 0.10, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s'),
(167, 162, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(168, 163, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(169, 164, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(170, 165, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(171, 166, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(172, 167, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(173, 168, 15, 'asdasdsad', 1, 500.00, ''),
(174, 169, 15, 'asdasdsad', 1, 500.00, ''),
(175, 170, 15, 'asdasdsad', 1, 500.00, ''),
(176, 171, 15, 'asdasdsad', 1, 500.00, ''),
(177, 172, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(178, 173, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg'),
(179, 174, 1, 'Notebook Gamer Pro', 1, 7499.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(180, 174, 2, 'Iphone 14 Pro Max', 1, 5999.50, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(181, 174, 14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 1, 1.00, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg');

-- --------------------------------------------------------

--
-- Estrutura para tabela `produtos`
--

CREATE TABLE `produtos` (
  `id_produto` int NOT NULL,
  `nome` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `descricao` text COLLATE utf8mb4_general_ci,
  `preco` decimal(10,2) NOT NULL,
  `estoque` int NOT NULL DEFAULT '0',
  `imagem_url` varchar(2048) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `id_categoria` int DEFAULT NULL,
  `id_marca` int DEFAULT NULL,
  `desconto_percentual` int NOT NULL DEFAULT '0',
  `visualizacoes` int NOT NULL DEFAULT '0',
  `peso` decimal(10,2) NOT NULL DEFAULT '0.30',
  `comprimento` decimal(10,2) NOT NULL DEFAULT '16.00',
  `altura` decimal(10,2) NOT NULL DEFAULT '2.00',
  `largura` decimal(10,2) NOT NULL DEFAULT '11.00',
  `mercado_livre_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ml_status` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'Não Publicado',
  `tiktok_video_url` varchar(2048) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tiktok_product_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tiktok_status` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'Não Publicado',
  `custo` decimal(10,2) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `ml_category_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'ID da categoria do Mercado Livre',
  `ml_attributes` json DEFAULT NULL COMMENT 'Atributos do produto para o Mercado Livre'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `produtos`
--

INSERT INTO `produtos` (`id_produto`, `nome`, `descricao`, `preco`, `estoque`, `imagem_url`, `id_categoria`, `id_marca`, `desconto_percentual`, `visualizacoes`, `peso`, `comprimento`, `altura`, `largura`, `mercado_livre_id`, `ml_status`, `tiktok_video_url`, `tiktok_product_id`, `tiktok_status`, `custo`, `ativo`, `ml_category_id`, `ml_attributes`) VALUES
(1, 'Notebook Gamer ASUS TUF Gaming A15, Ryzen 7, RTX 2050, 8GB RAM, 512GB SSD, Tela 15.6 IPS 144Hz, Linux KeepOS, Graphite Black - FA506NFR-HN069', 'Notebook de alta performance para jogos e trabalho pesado.', 3916.73, 9, 'https://http2.mlstatic.com/D_NQ_NP_2X_831450-MLA82195505947_012025-F.webp', 1, 3, 0, 66, 0.50, 20.00, 20.00, 20.00, 'MLB5692897806', 'paused', NULL, NULL, 'Não Publicado', NULL, 1, 'MLB1652', '[{\"id\": \"GTIN\", \"value_name\": \"N/A\"}, {\"id\": \"BRAND\", \"value_name\": \"Asus\"}, {\"id\": \"LINE\", \"value_name\": \"TUF Gaming\"}, {\"id\": \"MODEL\", \"value_name\": \"A15\"}, {\"id\": \"MPN\", \"value_name\": \"FA506NFR-HN069\"}, {\"id\": \"PROCESSOR_BRAND\", \"value_name\": \"Intel\"}, {\"id\": \"PROCESSOR_LINE\", \"value_name\": \"Core i7\"}, {\"id\": \"PROCESSOR_MODEL\", \"value_name\": \"7735HS\"}, {\"id\": \"GPU_BRAND\", \"value_name\": \"NVIDIA\"}, {\"id\": \"GPU_MODEL\", \"value_name\": \"GeForce RTX 2050\"}, {\"id\": \"RAM\", \"value_name\": \"8 GB\"}, {\"id\": \"HARD_DRIVE_CAPACITY\", \"value_name\": \"512 GB\"}, {\"id\": \"DISPLAY_SIZE\", \"value_name\": \"15.6 in\"}, {\"id\": \"OPERATING_SYSTEM_NAME\", \"value_name\": \"Linux\"}]'),
(2, 'Iphone 14 Pro Max', 'O mais novo lançamento com câmera de 200MP e tela AMOLED.', 5999.50, 4, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500', 2, 2, 0, 31, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, 'MLB1055', '[{\"id\": \"BRAND\", \"value_name\": \"Apple\"}, {\"id\": \"IS_DUAL_SIM\", \"value_name\": \"Sim\"}, {\"id\": \"MODEL\", \"value_name\": \"iPhone 14 Pro Max\"}, {\"id\": \"COLOR\", \"value_name\": \"Cinza-escuro\"}, {\"id\": \"MANUFACTURER\", \"value_name\": \"Apple\"}, {\"id\": \"CELLPHONES_ANATEL_HOMOLOGATION_NUMBER\", \"value_name\": \"111172201993\"}, {\"id\": \"CARRIER\", \"value_name\": \"Desbloqueado\"}, {\"id\": \"ALPHANUMERIC_MODELS\", \"value_name\": \"SM-A226BR/DSN\"}]'),
(3, 'Teclado Mecânico RGB', 'Teclado com switches blue e iluminação RGB customizável.', 349.90, 36, 'https://m.media-amazon.com/images/I/61mlyv6CgML.__AC_SY300_SX300_QL70_ML2_.jpg', 4, 1, 0, 5, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(4, 'Produto de Teste (10 Centavos)', 'Este é um produto para testar o fluxo de pagamento.', 0.10, 63, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWDyNk_TdQs6q8U19A58RUJpkSjuM6egaDBQ&s', 4, 2, 0, 34, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(10, 'perfume cheiroso', 'tal', 251.00, 10, 'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dwa1988708/Produtos/PRODUTO/NATBRA-76425_2.jpg', 2, 4, 0, 2, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(11, ' Notebook Gamer G15-5525 com Processador AMD Ryzen', '\nNotebook Gamer G15-5525 com Processador AMD Ryzen', 5000.00, 12, 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/g-series/g15-5525/pdp/laptop-g-series-15-5525-pdp-hero-bk-coralkb.psd?qlt=95&fit=constrain,1&hei=400&wid=570&fmt=jpg', 1, 3, 0, 19, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(12, 'Samsung s24 Ultra 512Gb', 'Samsung s24 Ultra 512Gb', 10000.00, 2, 'https://m.media-amazon.com/images/I/51rPU0jDc0L._UF1000,1000_QL80_.jpg', 2, 1, 0, 40, 0.30, 16.00, 2.00, 11.00, 'MLB4192475687', 'under_review', NULL, NULL, 'Não Publicado', NULL, 1, 'MLB1055', '[{\"id\": \"BRAND\", \"value_name\": \"Samsung\"}, {\"id\": \"MODEL\", \"value_name\": \"S24 Ultra\"}, {\"id\": \"IS_DUAL_SIM\", \"value_name\": \"Sim\"}, {\"id\": \"COLOR\", \"value_name\": \"Preto\"}, {\"id\": \"MANUFACTURER\", \"value_name\": \"SAMSUNG ELETRONICA DA AMAZONIA LTDA\"}, {\"id\": \"ALPHANUMERIC_MODELS\", \"value_name\": \"SM-S908E/DS\"}, {\"id\": \"CARRIER\", \"value_name\": \"Desbloqueado\"}, {\"id\": \"CELLPHONES_ANATEL_HOMOLOGATION_NUMBER\", \"value_name\": \"206372300953\"}]'),
(14, 'Mini rack 19\" 03u x 350MM Preto c/ 02 Chaves Max Eletron 4040', 'sfx', 1.00, 2, 'https://m.media-amazon.com/images/I/41jzIoYiq+L._AC_SX679_.jpg', 4, 3, 0, 28, 3.70, 50.00, 37.00, 17.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(15, 'asdasdsad', 'teste', 500.00, 1, '', 4, 2, 0, 10, 0.30, 16.00, 2.00, 11.00, NULL, 'Não Publicado', NULL, NULL, 'Não Publicado', NULL, 1, NULL, NULL),
(16, 'Drone Xiaomi Fimi Mini 3 4k 60fps Fimi Mini 3 Laçamento Cor Laranja', 'Escada Alumínio E Fibra De Vidro Extensível 7,2 Metros Profissional 23 Degraus Com Catraca\n\nEscada Extensiva Degraus em D, Vazada 4,20 fechada e 7,20 mts extendida\nEscada Extensível de Fibra de Vidro W Bertolo Segurança, Altura e Confiabilidade para o seu Trabalho\n\nSe você precisa alcançar locais elevados com segurança e praticidade, a Escada Extensível de Fibra de Vidro W Bertolo é a escolha ideal. Desenvolvida especialmente para eletricistas e profissionais que trabalham em altura, essa escada combina resistência, estabilidade e funcionalidade para atender às mais diversas demandas. Com um design robusto e materiais de alta qualidade, ela garante não apenas durabilidade, mas também um manuseio prático e eficiente.\n\n\nDurabilidade e Resistência para Diferentes Aplicações\n:\nFabricada em fibra de vidro, a escada é extremamente resistente à corrosão, não conduz eletricidade e apresenta uma estrutura leve, facilitando o transporte e a utilização. Seu formato extensível permite ajustes conforme a necessidade, tornando-a ideal para serviços de manutenção elétrica, telecomunicações, construção civil e diversas outras aplicações industriais e residenciais.\n\nCom um sistema de corda e roldana, a altura da escada pode ser ajustada facilmente, chegando a 7,20 metros quando totalmente estendida e a 4,20 metros quando retraída. Essa versatilidade possibilita o uso em diferentes cenários, adaptando-se perfeitamente a cada situação de trabalho.\n\nConforto, Segurança e Estabilidade em Cada Degrau\n\n* Estrutura reforçada e leve: Apesar de sua resistência, a escada pesa apenas 22 kg, permitindo fácil transporte e armazenamento.\n* Capacidade de carga de 120 kg: Garante um suporte seguro para profissionais e suas ferramentas.\n* Degraus tipo D em alumínio com frisos: Proporcionam mais aderência e conforto, reduzindo o risco de escorregamento.\n* Base antiderrapante emborrachada: Maior estabilidade durante o uso, evitando deslizamentos indesejados.\n* Sistema de travamento seguro: A roldana e a catraca garantem a fixação firme da parte extensível, impedindo movimentações inesperadas.\n\nProjetada para Facilitar seu Dia a Dia\n* Material isolante: A fibra de vidro impede a condução de eletricidade, tornando a escada ideal para serviços em redes elétricas e instalações.\n* Design funcional: Pode ser utilizada em diferentes alturas, permitindo um ajuste preciso conforme a necessidade.\n* Longa vida útil: Resistente à corrosão química, não enferruja e possui baixa absorção de água.\n\nQualidade e Garantia W.Bertolo\nAo adquirir a Escada Extensível W Bertolo, você conta com um produto de alto padrão, desenvolvido por uma das marcas mais reconhecidas no mercado. Além disso, o equipamento possui garantia de 6 meses contra defeitos de fabricação, assegurando ainda mais confiabilidade e segurança para o seu trabalho.\n\nA Escada Extensível de Fibra de Vidro W Bertolo é a aliada perfeita para quem busca eficiência, estabilidade e durabilidade ao executar serviços em altura. Garanta agora mesmo a sua e trabalhe com muito mais praticidade e segurança!\n\n*Garantia: 03 meses contra defeitos de fabricação.\n\n*Imagens Meramente Ilustrativas.\n*Objetos de decoração das fotos não estão inclusos.\n*As cores podem variar conforme monitor/smartphone utilizado para a visualização do anúncio.', 1149.00, 10, 'https://http2.mlstatic.com/D_NQ_NP_2X_826565-MLA91568661686_092025-F.webp', 4, 1, 0, 6, 0.30, 16.00, 2.00, 11.00, 'MLB5692978622', 'paused', NULL, NULL, 'Não Publicado', NULL, 1, 'MLB430419', '[{\"id\": \"BRAND\", \"value_name\": \"Xiaomi\"}, {\"id\": \"MODEL\", \"value_name\": \"Mini 3\"}]');

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL,
  `nome_completo` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `hash_senha` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `endereco_criptografado` text COLLATE utf8mb4_general_ci,
  `telefone_criptografado` text COLLATE utf8mb4_general_ci,
  `cpf_criptografado` text COLLATE utf8mb4_general_ci,
  `data_nascimento_criptografada` text COLLATE utf8mb4_general_ci,
  `isAdmin` tinyint(1) NOT NULL DEFAULT '0',
  `data_criacao` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id_usuario`, `nome_completo`, `email`, `hash_senha`, `endereco_criptografado`, `telefone_criptografado`, `cpf_criptografado`, `data_nascimento_criptografada`, `isAdmin`, `data_criacao`) VALUES
(1, 'Alice Silva', 'alice.silva@example.com', 'hash_da_senha_123', NULL, NULL, NULL, NULL, 0, '2025-09-02 14:52:38'),
(2, 'Bruno Costa', 'bruno.costa@example.com', 'hash_da_senha_456', NULL, NULL, NULL, NULL, 0, '2025-09-02 14:52:38'),
(3, 'Carla Dias', 'carla.dias@example.com', 'hash_da_senha_789', NULL, NULL, NULL, NULL, 0, '2025-09-02 14:52:38'),
(7, 'Rayan da Silva Chaves', 'rayanchaveshotmail@gmail.com', '$2b$10$6UsbMpuaIkF4Y5txxctthed8I6pqLxv4MtetDSbNZF1n.ZFAhUcrC', NULL, 'b0d58d962ba328b73cd8dc037d6780e6', '785f55cbf90a2bf759f8bcd59ca7af36', 'acaad7e88cfa0e45f8305d5daa9eadab', 1, '2025-09-02 14:52:38'),
(8, 'Talia Seixas da Silva', 'taliaseixas02@gmail.com', '$2b$10$eJq0c9bJIegqNQtD5chWx.qfcMYTJ5nlYlD/1ppkOTvwn6gYPivkm', NULL, 'a0c3f893cf18b04d712ff896e32f9c24', '0feb5727fd9f7f0433882283eb526981', '9ccdced651742a8ebd0e2a8446e7d3c3', 0, '2025-09-02 14:52:38');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `avaliacoes`
--
ALTER TABLE `avaliacoes`
  ADD PRIMARY KEY (`id_avaliacao`),
  ADD KEY `id_produto` (`id_produto`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Índices de tabela `banners_laterais`
--
ALTER TABLE `banners_laterais`
  ADD PRIMARY KEY (`id_banner`);

--
-- Índices de tabela `carrinhos`
--
ALTER TABLE `carrinhos`
  ADD PRIMARY KEY (`id_carrinho`),
  ADD UNIQUE KEY `id_usuario` (`id_usuario`,`id_produto`),
  ADD KEY `id_produto` (`id_produto`);

--
-- Índices de tabela `carrossel_slides`
--
ALTER TABLE `carrossel_slides`
  ADD PRIMARY KEY (`id_slide`);

--
-- Índices de tabela `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id_categoria`),
  ADD UNIQUE KEY `nome` (`nome`);

--
-- Índices de tabela `comunicados`
--
ALTER TABLE `comunicados`
  ADD PRIMARY KEY (`id_comunicado`);

--
-- Índices de tabela `configuracoes`
--
ALTER TABLE `configuracoes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `chave` (`chave`);

--
-- Índices de tabela `configuracoes_frete`
--
ALTER TABLE `configuracoes_frete`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `chave` (`chave`);

--
-- Índices de tabela `cupons_desconto`
--
ALTER TABLE `cupons_desconto`
  ADD PRIMARY KEY (`id_cupom`),
  ADD UNIQUE KEY `codigo` (`codigo`);

--
-- Índices de tabela `destaques_categorias`
--
ALTER TABLE `destaques_categorias`
  ADD PRIMARY KEY (`id_destaque`);

--
-- Índices de tabela `enderecos`
--
ALTER TABLE `enderecos`
  ADD PRIMARY KEY (`id_endereco`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Índices de tabela `historico_precos`
--
ALTER TABLE `historico_precos`
  ADD PRIMARY KEY (`id_historico`),
  ADD KEY `idx_id_produto` (`id_produto`);

--
-- Índices de tabela `lista_desejos`
--
ALTER TABLE `lista_desejos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_usuario_produto` (`id_usuario`,`id_produto`),
  ADD KEY `fk_lista_desejos_produto` (`id_produto`);

--
-- Índices de tabela `log_estoque`
--
ALTER TABLE `log_estoque`
  ADD PRIMARY KEY (`id_log`),
  ADD KEY `idx_id_produto` (`id_produto`),
  ADD KEY `fk_log_estoque_usuario` (`id_usuario_responsavel`);

--
-- Índices de tabela `marcas`
--
ALTER TABLE `marcas`
  ADD PRIMARY KEY (`id_marca`),
  ADD UNIQUE KEY `nome` (`nome`);

--
-- Índices de tabela `pedidos`
--
ALTER TABLE `pedidos`
  ADD PRIMARY KEY (`id_pedido`),
  ADD KEY `id_usuario` (`id_usuario`),
  ADD KEY `id_endereco_entrega` (`id_endereco_entrega`),
  ADD KEY `fk_pedidos_cupom` (`id_cupom_utilizado`);

--
-- Índices de tabela `pedido_items`
--
ALTER TABLE `pedido_items`
  ADD PRIMARY KEY (`id_item`),
  ADD KEY `id_pedido` (`id_pedido`);

--
-- Índices de tabela `produtos`
--
ALTER TABLE `produtos`
  ADD PRIMARY KEY (`id_produto`),
  ADD KEY `id_categoria` (`id_categoria`),
  ADD KEY `id_marca` (`id_marca`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id_usuario`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `avaliacoes`
--
ALTER TABLE `avaliacoes`
  MODIFY `id_avaliacao` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de tabela `banners_laterais`
--
ALTER TABLE `banners_laterais`
  MODIFY `id_banner` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de tabela `carrinhos`
--
ALTER TABLE `carrinhos`
  MODIFY `id_carrinho` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=203;

--
-- AUTO_INCREMENT de tabela `carrossel_slides`
--
ALTER TABLE `carrossel_slides`
  MODIFY `id_slide` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id_categoria` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de tabela `comunicados`
--
ALTER TABLE `comunicados`
  MODIFY `id_comunicado` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `configuracoes`
--
ALTER TABLE `configuracoes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=230;

--
-- AUTO_INCREMENT de tabela `configuracoes_frete`
--
ALTER TABLE `configuracoes_frete`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de tabela `cupons_desconto`
--
ALTER TABLE `cupons_desconto`
  MODIFY `id_cupom` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `destaques_categorias`
--
ALTER TABLE `destaques_categorias`
  MODIFY `id_destaque` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de tabela `enderecos`
--
ALTER TABLE `enderecos`
  MODIFY `id_endereco` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT de tabela `historico_precos`
--
ALTER TABLE `historico_precos`
  MODIFY `id_historico` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `lista_desejos`
--
ALTER TABLE `lista_desejos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `log_estoque`
--
ALTER TABLE `log_estoque`
  MODIFY `id_log` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `marcas`
--
ALTER TABLE `marcas`
  MODIFY `id_marca` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de tabela `pedidos`
--
ALTER TABLE `pedidos`
  MODIFY `id_pedido` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=175;

--
-- AUTO_INCREMENT de tabela `pedido_items`
--
ALTER TABLE `pedido_items`
  MODIFY `id_item` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=182;

--
-- AUTO_INCREMENT de tabela `produtos`
--
ALTER TABLE `produtos`
  MODIFY `id_produto` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_usuario` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `avaliacoes`
--
ALTER TABLE `avaliacoes`
  ADD CONSTRAINT `avaliacoes_ibfk_1` FOREIGN KEY (`id_produto`) REFERENCES `produtos` (`id_produto`) ON DELETE CASCADE,
  ADD CONSTRAINT `avaliacoes_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;

--
-- Restrições para tabelas `carrinhos`
--
ALTER TABLE `carrinhos`
  ADD CONSTRAINT `carrinhos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE,
  ADD CONSTRAINT `carrinhos_ibfk_2` FOREIGN KEY (`id_produto`) REFERENCES `produtos` (`id_produto`) ON DELETE CASCADE;

--
-- Restrições para tabelas `enderecos`
--
ALTER TABLE `enderecos`
  ADD CONSTRAINT `enderecos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;

--
-- Restrições para tabelas `historico_precos`
--
ALTER TABLE `historico_precos`
  ADD CONSTRAINT `fk_historico_precos_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos` (`id_produto`) ON DELETE CASCADE;

--
-- Restrições para tabelas `lista_desejos`
--
ALTER TABLE `lista_desejos`
  ADD CONSTRAINT `fk_lista_desejos_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos` (`id_produto`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_lista_desejos_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;

--
-- Restrições para tabelas `log_estoque`
--
ALTER TABLE `log_estoque`
  ADD CONSTRAINT `fk_log_estoque_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos` (`id_produto`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_log_estoque_usuario` FOREIGN KEY (`id_usuario_responsavel`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL;

--
-- Restrições para tabelas `pedidos`
--
ALTER TABLE `pedidos`
  ADD CONSTRAINT `fk_pedidos_cupom` FOREIGN KEY (`id_cupom_utilizado`) REFERENCES `cupons_desconto` (`id_cupom`) ON DELETE SET NULL,
  ADD CONSTRAINT `pedidos_fk_endereco` FOREIGN KEY (`id_endereco_entrega`) REFERENCES `enderecos` (`id_endereco`),
  ADD CONSTRAINT `pedidos_fk_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`);

--
-- Restrições para tabelas `pedido_items`
--
ALTER TABLE `pedido_items`
  ADD CONSTRAINT `pedido_items_fk_pedido` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos` (`id_pedido`) ON DELETE CASCADE;

--
-- Restrições para tabelas `produtos`
--
ALTER TABLE `produtos`
  ADD CONSTRAINT `produtos_ibfk_1` FOREIGN KEY (`id_categoria`) REFERENCES `categorias` (`id_categoria`),
  ADD CONSTRAINT `produtos_ibfk_2` FOREIGN KEY (`id_marca`) REFERENCES `marcas` (`id_marca`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
