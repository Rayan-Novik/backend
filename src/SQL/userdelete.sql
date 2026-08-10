-- 1. COLOCAR O ID DO USUÁRIO AQUI
SET @id_usuario = 1451; 

START TRANSACTION;

-- 2. Apagar ITENS DO PEDIDO (Tabela: pedido_items)
-- Precisamos apagar os itens antes de apagar o pedido
DELETE pi 
FROM pedido_items AS pi
INNER JOIN pedidos AS p ON pi.id_pedido = p.id_pedido
WHERE p.id_usuario = @id_usuario;

-- 3. Apagar PEDIDOS (Tabela: pedidos)
-- Isso libera a trava que impedia de apagar os endereços
DELETE FROM pedidos 
WHERE id_usuario = @id_usuario;

-- 4. Apagar DADOS PERIFÉRICOS
-- Tabela: carrinhos
DELETE FROM carrinhos WHERE id_usuario = @id_usuario;
-- Tabela: lista_desejos (Favoritos)
DELETE FROM lista_desejos WHERE id_usuario = @id_usuario;
-- Tabela: avaliacoes
DELETE FROM avaliacoes WHERE id_usuario = @id_usuario;

-- 5. Tratamento de Logs de Estoque (Se for funcionário)
-- Se este usuário mexeu no estoque, removemos o rastro dele ou definimos como NULL.
-- Vou colocar para deletar para limpar "tudo referente a ele" conforme pediu.
DELETE FROM log_estoque WHERE id_usuario_responsavel = @id_usuario;

-- 6. Apagar ENDEREÇOS (Tabela: enderecos)
DELETE FROM enderecos 
WHERE id_usuario = @id_usuario;

-- 7. Apagar USUÁRIO (Tabela: usuarios)
DELETE FROM usuarios 
WHERE id_usuario = @id_usuario;

COMMIT;

SELECT 'Usuário e todos os vínculos deletados com sucesso.' AS Resultado;