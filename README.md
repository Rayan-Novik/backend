# E-commerce Backend API

Backend robusto para plataforma de e-commerce com arquitetura em camadas (MVC), integrações de marketplace e serviços de automação.

## 🚀 Tecnologias

- **Runtime:** Node.js
- **Framework:** Express (implícito pela estrutura)
- **ORM:** Prisma
- **Banco de Dados:** SQL (via Prisma e scripts SQL)
- **Integrações:** Mercado Pago, Mercado Livre, TikTok Shop, ViaCEP.

## 📂 Arquitetura do Projeto

O projeto segue uma arquitetura modular focada em separação de responsabilidades:

- **/config**: Configurações de ambiente e conexões externas (DB, Mercado Pago).
- **/controllers**: Lógica de entrada das requisições (Validação e Resposta).
- **/services**: Regras de negócio complexas e integrações externas (ex: `mercadoLivreService`, `emailService`).
- **/models**: Camada de dados (quando não gerenciada puramente pelo Prisma).
- **/routes**: Definição dos endpoints da API.
- **/middlewares**: Interceptadores para Autenticação, Uploads e Tratamento de Erros.
- **/prisma**: Schema do banco de dados (ORM).
- **/utils**: Funções auxiliares (Criptografia, Geração de Tokens).

## 🔧 Instalação e Configuração

1. **Clone o repositório**
2. **Instale as dependências:**
   ```bash
   npm install