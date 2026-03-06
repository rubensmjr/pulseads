# ⚡ Pulse Ads — SaaS de Dashboard Meta Ads

Sistema completo com autenticação, múltiplos usuários, planos e painel admin.

## Estrutura

```
pulseads/
├── backend/
│   ├── server.js          ← Servidor Express principal
│   ├── db.js              ← Banco SQLite
│   ├── middleware/
│   │   └── auth.js        ← JWT middleware
│   ├── routes/
│   │   ├── auth.js        ← Login, registro, perfil
│   │   ├── accounts.js    ← CRUD contas Meta
│   │   ├── meta.js        ← Proxy seguro para Meta API
│   │   └── admin.js       ← Painel admin
│   ├── utils/
│   │   └── crypto.js      ← Criptografia de tokens
│   └── .env.example       ← Variáveis de ambiente
├── frontend/
│   ├── index.html         ← Página de login
│   ├── dashboard.html     ← Dashboard principal
│   └── admin.html         ← Painel admin
└── scripts/
    └── install.sh         ← Instalação automática VPS
```

## Rodar localmente

```bash
# 1. Entrar na pasta backend
cd backend

# 2. Instalar dependências
npm install

# 3. Criar arquivo .env
cp .env.example .env
# Edite o .env com suas configurações

# 4. Iniciar servidor
npm start
# Acesse: http://localhost:3000
```

## Deploy em VPS (Ubuntu)

```bash
# 1. Enviar arquivos para VPS
scp -r pulseads/ root@IP_DA_VPS:/tmp/pulseads

# 2. Acessar VPS
ssh root@IP_DA_VPS

# 3. Rodar instalação automática
cd /tmp/pulseads
bash scripts/install.sh
```

## Planos disponíveis

| Plano   | Contas | Preço sugerido |
|---------|--------|----------------|
| Basic   | 1      | R$ 49,90/mês   |
| Pro     | 5      | R$ 99,90/mês   |
| Agency  | ∞      | R$ 199,90/mês  |

## Segurança

- ✅ Tokens Meta criptografados no banco (AES-256)
- ✅ Senhas com bcrypt (salt rounds: 10)
- ✅ JWT com expiração de 7 dias
- ✅ Rate limiting em todas as rotas
- ✅ Helmet.js (headers de segurança)
- ✅ CORS configurável
- ✅ Cada usuário vê apenas suas próprias contas
- ✅ Tokens NUNCA expostos no frontend

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Registro
- `GET /api/auth/me` — Perfil do usuário
- `PUT /api/auth/password` — Alterar senha

### Contas Meta
- `GET /api/accounts` — Listar contas do usuário
- `POST /api/accounts` — Adicionar conta
- `PUT /api/accounts/:id` — Editar conta
- `DELETE /api/accounts/:id` — Remover conta

### Meta API (proxy seguro)
- `GET /api/meta/:accountId/all` — Todos os dados (insights, campanhas, adsets)
- `GET /api/meta/:accountId/insights` — Insights
- `GET /api/meta/:accountId/campaigns` — Campanhas
- `GET /api/meta/:accountId/adsets` — Conjuntos de anúncios

### Admin
- `GET /api/admin/stats` — Estatísticas gerais
- `GET /api/admin/users` — Listar usuários
- `POST /api/admin/users` — Criar usuário
- `PUT /api/admin/users/:id` — Editar usuário
- `GET /api/admin/plans` — Listar planos
- `PUT /api/admin/plans/:id` — Editar plano
