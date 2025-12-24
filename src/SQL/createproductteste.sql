-- 1. Primeiro, garantimos que existe pelo menos uma categoria e uma marca
-- para não dar erro de Chave Estrangeira (Foreign Key)
INSERT IGNORE INTO categorias (nome) VALUES ('Categoria SQL Teste');
INSERT IGNORE INTO marcas (nome) VALUES ('Marca SQL Teste');

-- 2. Pegamos os IDs recém criados (ou existentes)
SET @id_cat = (SELECT id_categoria FROM categorias LIMIT 1);
SET @id_marca = (SELECT id_marca FROM marcas LIMIT 1);

-- 3. Criamos a Procedure (Função) para gerar o loop
DELIMITER $$

DROP PROCEDURE IF EXISTS GerarProdutosTeste$$

CREATE PROCEDURE GerarProdutosTeste()
BEGIN
    DECLARE i INT DEFAULT 1;
    
    -- Mude o 100 abaixo para a quantidade que você quiser
    WHILE i <= 100 DO
        INSERT INTO produtos (
            nome, 
            descricao, 
            preco, 
            estoque, 
            id_categoria, 
            id_marca, 
            imagem_url, 
            peso, 
            comprimento, 
            altura, 
            largura, 
            ativo, 
            active_ecommerce,
            id_externo,   -- Importante ser único
            ml_status
        ) VALUES (
            CONCAT('Produto SQL ', i), 
            CONCAT('Descrição automática do produto ', i, ' gerada via SQL.'), 
            ROUND((RAND() * (500 - 10) + 10), 2), -- Preço aleatório entre 10 e 500
            FLOOR(RAND() * 100), -- Estoque aleatório
            @id_cat, 
            @id_marca, 
            'https://placehold.co/600x400', 
            0.50, 
            20.00, 
            10.00, 
            15.00, 
            1, -- true
            1, -- true
            CONCAT('SQL-REF-', UUID_SHORT()), -- Gera um ID único para evitar erro
            'Não Publicado'
        );
        SET i = i + 1;
    END WHILE;
END$$

DELIMITER ;

-- 4. Executa a procedure
CALL GerarProdutosTeste();

-- 5. (Opcional) Limpa a procedure depois de usar
DROP PROCEDURE GerarProdutosTeste;

-- 6. Verifica o resultado
SELECT * FROM produtos ORDER BY id_produto DESC LIMIT 10;