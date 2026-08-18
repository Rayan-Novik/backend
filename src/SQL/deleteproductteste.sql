-- 1. Apagar os produtos criados via Script SQL ou Prisma Seed
DELETE FROM produtos 
WHERE nome LIKE 'Produto SQL %' 
   OR nome LIKE 'Produto Teste %';

-- 2. Apagar as categorias de teste criadas
DELETE FROM categorias 
WHERE nome IN ('Categoria Teste', 'Categoria SQL Teste');

-- 3. Apagar as marcas de teste criadas
DELETE FROM marcas 
WHERE nome IN ('Marca Teste', 'Marca SQL Teste');