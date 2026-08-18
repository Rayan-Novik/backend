import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.SERVER_PORT || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL,
  BACKEND_URL: process.env.BACKEND_URL,
  DB: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306)
  },
  JWT_SECRET: process.env.JWT_SECRET,
  MP_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
  T: { // Mapeamento de Tabelas e Colunas
    USUARIOS: {
      NOME: process.env.TABLE_USUARIOS_NOME,
      ID: process.env.TABLE_USUARIOS_COL_ID,
      NOME_COL: process.env.TABLE_USUARIOS_COL_NOME,
      EMAIL: process.env.TABLE_USUARIOS_COL_EMAIL,
      HASH: process.env.TABLE_USUARIOS_COL_HASH
    },
    PRODUTOS: {
      NOME: process.env.TABLE_PRODUTOS_NOME,
      ID: process.env.TABLE_PRODUTOS_COL_ID,
      NOME_COL: process.env.TABLE_PRODUTOS_COL_NOME,
      DESC: process.env.TABLE_PRODUTOS_COL_DESC,
      PRECO: process.env.TABLE_PRODUTOS_COL_PRECO,
      ESTOQUE: process.env.TABLE_PRODUTOS_COL_ESTOQUE,
      IMG: process.env.TABLE_PRODUTOS_COL_IMG
    },
    ENDERECOS: {
      NOME: process.env.TABLE_ENDERECOS_NOME,
      ID: process.env.TABLE_ENDERECOS_COL_ID,
      USUARIO: process.env.TABLE_ENDERECOS_COL_USUARIO,
      CEP: process.env.TABLE_ENDERECOS_COL_CEP,
      LOG: process.env.TABLE_ENDERECOS_COL_LOG,
      NUM: process.env.TABLE_ENDERECOS_COL_NUM,
      COMP: process.env.TABLE_ENDERECOS_COL_COMP,
      BAIRRO: process.env.TABLE_ENDERECOS_COL_BAIRRO,
      CIDADE: process.env.TABLE_ENDERECOS_COL_CIDADE,
      UF: process.env.TABLE_ENDERECOS_COL_UF,
      PRINC: process.env.TABLE_ENDERECOS_COL_PRINC
    },
    CARRINHOS: {
      NOME: process.env.TABLE_CARRINHOS_NOME,
      ID: process.env.TABLE_CARRINHOS_COL_ID,
      USUARIO: process.env.TABLE_CARRINHOS_COL_USUARIO,
      PROD: process.env.TABLE_CARRINHOS_COL_PROD,
      QTD: process.env.TABLE_CARRINHOS_COL_QTD
    },
    PEDIDOS: {
      NOME: process.env.TABLE_PEDIDOS_NOME,
      ID: process.env.TABLE_PEDIDOS_COL_ID,
      USUARIO: process.env.TABLE_PEDIDOS_COL_USUARIO,
      ENDERECO: process.env.TABLE_PEDIDOS_COL_ENDERECO,
      METODO: process.env.TABLE_PEDIDOS_COL_METODO,
      PRECO_ITENS: process.env.TABLE_PEDIDOS_COL_PRECO_ITENS,
      PRECO_FRETE: process.env.TABLE_PEDIDOS_COL_PRECO_FRETE,
      PRECO_TOTAL: process.env.TABLE_PEDIDOS_COL_PRECO_TOTAL,
      STATUS: process.env.TABLE_PEDIDOS_COL_STATUS,
      PG_ID: process.env.TABLE_PEDIDOS_COL_PG_ID,
      DATA: process.env.TABLE_PEDIDOS_COL_DATA
    },
    PEDIDO_ITENS: {
      NOME: process.env.TABLE_PEDIDO_ITENS_NOME,
      ID: process.env.TABLE_PEDIDO_ITENS_COL_ID,
      PEDIDO: process.env.TABLE_PEDIDO_ITENS_COL_PEDIDO,
      PROD: process.env.TABLE_PEDIDO_ITENS_COL_PROD,
      NOME_COL: process.env.TABLE_PEDIDO_ITENS_COL_NOME,
      QTD: process.env.TABLE_PEDIDO_ITENS_COL_QTD,
      PRECO: process.env.TABLE_PEDIDO_ITENS_COL_PRECO,
      IMG: process.env.TABLE_PEDIDO_ITENS_COL_IMG
    }
  }
};