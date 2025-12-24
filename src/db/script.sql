-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 15/08/2025 às 02:26
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.0.30

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
-- Estrutura para tabela `carrinhos`
--

CREATE TABLE `carrinhos` (
  `id_carrinho` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `id_produto` int(11) NOT NULL,
  `quantidade` int(11) NOT NULL,
  `data_adicionado` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `enderecos`
--

CREATE TABLE `enderecos` (
  `id_endereco` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `cep` varchar(10) NOT NULL,
  `logradouro` varchar(255) NOT NULL,
  `numero` varchar(20) NOT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) NOT NULL,
  `cidade` varchar(100) NOT NULL,
  `estado` varchar(2) NOT NULL,
  `is_principal` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `enderecos`
--

INSERT INTO `enderecos` (`id_endereco`, `id_usuario`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `is_principal`) VALUES
(1, 4, '69088483', 'Jorge Texeira', '2', '', 'Jorge Teixeira', 'Manaus', 'AM', 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `formas_pagamento`
--

CREATE TABLE `formas_pagamento` (
  `id_pagamento` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `gateway` varchar(50) NOT NULL,
  `token_cartao` varchar(255) NOT NULL,
  `ultimos_4_digitos` varchar(4) NOT NULL,
  `bandeira` varchar(50) NOT NULL,
  `mes_expiracao` int(11) NOT NULL,
  `ano_expiracao` int(11) NOT NULL,
  `is_principal` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `gateways_pagamento`
--

CREATE TABLE `gateways_pagamento` (
  `id_gateway` int(11) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `api_url` varchar(255) NOT NULL,
  `api_key_criptografada` text NOT NULL,
  `is_ativo` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `gateways_pagamento`
--

INSERT INTO `gateways_pagamento` (`id_gateway`, `nome`, `api_url`, `api_key_criptografada`, `is_ativo`) VALUES
(1, 'Asaas Sandbox', 'https://sandbox.asaas.com/api/v3', '4e6ee042d741e8c11a2ff4dc9a8a018a902cce8ceb0c62f79b8ff627ad846701bdfaeede156678ec3e19eec2b6463083c36ff13a736ca1e8c60822e35f914bb26fac0da639e62f84b021e2d8fa88bcb927619e355c1a0930e297e9cfd3c0571853cb668a2c4ff3ffa140f883bcf582034aada1989ef2ee81365e340895ca8e44872d1ad336e5e8cce125a3ff93c769b3b830cbd812740e14b1a73394e97e326d4022874ee78476a94185b918dbaf86a6', 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `pedidos`
--

CREATE TABLE `pedidos` (
  `id_pedido` int(11) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `id_endereco_entrega` int(11) NOT NULL,
  `metodo_pagamento` varchar(50) NOT NULL,
  `preco_itens` decimal(10,2) NOT NULL,
  `preco_frete` decimal(10,2) NOT NULL,
  `preco_total` decimal(10,2) NOT NULL,
  `status_pagamento` varchar(50) DEFAULT 'PENDENTE',
  `status_entrega` varchar(50) DEFAULT 'NAO ENVIADO',
  `id_pagamento_gateway` varchar(255) DEFAULT NULL,
  `pix_qrcode_url` text DEFAULT NULL,
  `pix_copia_cola` text DEFAULT NULL,
  `data_pedido` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `produtos`
--

CREATE TABLE `produtos` (
  `id_produto` int(11) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `descricao` text DEFAULT NULL,
  `preco` decimal(10,2) NOT NULL,
  `estoque` int(11) NOT NULL DEFAULT 0,
  `imagem_url` varchar(2048) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `produtos`
--

INSERT INTO `produtos` (`id_produto`, `nome`, `descricao`, `preco`, `estoque`, `imagem_url`) VALUES
(1, 'Notebook Gamer Pro', 'Notebook de alta performance para jogos e trabalho pesado.', 7499.99, 15, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'),
(2, 'Smartphone Galaxy S25', 'O mais novo lançamento com câmera de 200MP e tela AMOLED.', 5999.50, 30, 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500'),
(3, 'Teclado Mecânico RGB', 'Teclado com switches blue e iluminação RGB customizável.', 349.90, 50, 'https://images.unsplash.com/photo-1595183241042-7a61a0942ed1?w=500');

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id_usuario` int(11) NOT NULL,
  `nome_completo` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `hash_senha` varchar(255) NOT NULL,
  `endereco_criptografado` text DEFAULT NULL,
  `telefone_criptografado` text DEFAULT NULL,
  `cpf_criptografado` text DEFAULT NULL,
  `data_nascimento_criptografada` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id_usuario`, `nome_completo`, `email`, `hash_senha`, `endereco_criptografado`, `telefone_criptografado`, `cpf_criptografado`, `data_nascimento_criptografada`) VALUES
(1, 'Alice Silva', 'alice.silva@example.com', 'hash_da_senha_123', NULL, NULL, NULL, NULL),
(2, 'Bruno Costa', 'bruno.costa@example.com', 'hash_da_senha_456', NULL, NULL, NULL, NULL),
(3, 'Carla Dias', 'carla.dias@example.com', 'hash_da_senha_789', NULL, NULL, NULL, NULL),
(4, 'Rayan da Silva Chaves', 'rayanchaveshotmail@gmail.com', '$2b$10$wqp9NVsfhEldVya6q/l0HedL3Qs7sx2jmYfZ78UTO0gjhAGohqvUS', '52332647073694eb33b2d6b4582dcf76', 'a0c3f893cf18b04d712ff896e32f9c24', '785f55cbf90a2bf759f8bcd59ca7af36', 'acaad7e88cfa0e45f8305d5daa9eadab'),
(5, 'Talia Seixas da Silva', 'rayanschaveshotmail@gmail.com', '$2b$10$fctTYRFbpAq3S/Lqs75E7eUvMNkmjHqdcyKj6XXZVA/qBn6uD485m', NULL, NULL, NULL, NULL);

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `carrinhos`
--
ALTER TABLE `carrinhos`
  ADD PRIMARY KEY (`id_carrinho`),
  ADD UNIQUE KEY `id_usuario` (`id_usuario`,`id_produto`),
  ADD KEY `id_produto` (`id_produto`);

--
-- Índices de tabela `enderecos`
--
ALTER TABLE `enderecos`
  ADD PRIMARY KEY (`id_endereco`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Índices de tabela `formas_pagamento`
--
ALTER TABLE `formas_pagamento`
  ADD PRIMARY KEY (`id_pagamento`),
  ADD UNIQUE KEY `token_cartao` (`token_cartao`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Índices de tabela `gateways_pagamento`
--
ALTER TABLE `gateways_pagamento`
  ADD PRIMARY KEY (`id_gateway`),
  ADD UNIQUE KEY `nome` (`nome`);

--
-- Índices de tabela `pedidos`
--
ALTER TABLE `pedidos`
  ADD PRIMARY KEY (`id_pedido`),
  ADD KEY `id_usuario` (`id_usuario`),
  ADD KEY `id_endereco_entrega` (`id_endereco_entrega`);

--
-- Índices de tabela `produtos`
--
ALTER TABLE `produtos`
  ADD PRIMARY KEY (`id_produto`);

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
-- AUTO_INCREMENT de tabela `carrinhos`
--
ALTER TABLE `carrinhos`
  MODIFY `id_carrinho` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `enderecos`
--
ALTER TABLE `enderecos`
  MODIFY `id_endereco` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `formas_pagamento`
--
ALTER TABLE `formas_pagamento`
  MODIFY `id_pagamento` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `gateways_pagamento`
--
ALTER TABLE `gateways_pagamento`
  MODIFY `id_gateway` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `pedidos`
--
ALTER TABLE `pedidos`
  MODIFY `id_pedido` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `produtos`
--
ALTER TABLE `produtos`
  MODIFY `id_produto` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_usuario` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Restrições para tabelas despejadas
--

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
-- Restrições para tabelas `formas_pagamento`
--
ALTER TABLE `formas_pagamento`
  ADD CONSTRAINT `formas_pagamento_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;

--
-- Restrições para tabelas `pedidos`
--
ALTER TABLE `pedidos`
  ADD CONSTRAINT `pedidos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  ADD CONSTRAINT `pedidos_ibfk_2` FOREIGN KEY (`id_endereco_entrega`) REFERENCES `enderecos` (`id_endereco`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
