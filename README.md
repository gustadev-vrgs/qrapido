# QRápido

Plataforma web de atendimento em restaurante via QR Code, com fluxo completo para cliente (mesa) e painel administrativo (operação).

## Stack
- Next.js 14 (App Router)
- React + TypeScript estrito
- Tailwind CSS + design system próprio
- Firebase Auth + Firestore
- Recharts para relatórios

## Funcionalidades principais
- **Admin**: dashboard, pedidos, mesas, cardápio, relatórios, configurações.
- **Cliente**: sessão por QR, criação de pedidos, estado da sessão em tempo real.
- **Operação**: abrir/fechar mesa, acompanhar produção, gerar QR e imprimir.
- **Qualidade**: loading/empty/error states, tipagem forte, layout responsivo.

## Rotas da aplicação
### Públicas
- `/` landing inicial
- `/login` autenticação de staff/admin
- `/m/[sessionToken]` experiência do cliente na mesa

### APIs
- `GET /api/health`
- `POST /api/public/session/access`
- `POST /api/public/order`
- `POST /api/public/session/action`
- `GET /api/public/session/state/[sessionToken]`
- `POST /api/admin/table/open`
- `POST /api/admin/table/close`

### Dashboard (protegido)
- `/dashboard`
- `/dashboard/pedidos`
- `/dashboard/mesas`
- `/dashboard/cardapio`
- `/dashboard/relatorios`
- `/dashboard/configuracoes`

## Setup local
```bash
npm install
cp env.example .env.local
npm run dev
```

Aplicação:
- Admin: `http://localhost:3000/login`
- Cliente (exemplo): `http://localhost:3000/m/<sessionToken>`

## Variáveis de ambiente
Preencha `.env.local` com:

### Front-end (Firebase Client SDK)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Servidor (Firebase Admin SDK)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (com `\n` escapado)
- `GOOGLE_APPLICATION_CREDENTIALS` (opcional, via ADC)

## Firebase
### Regras
- Arquivo: `firestore/firestore.rules`
- Estratégia inicial:
  - isolamento por `restaurantId`
  - leitura/escrita de staff autenticado no restaurante
  - sessão pública com restrições
  - criação pública de pedidos com validações mínimas

### Índices
- Arquivo: `firestore/firestore.indexes.json`
- Inclui índices para:
  - pedidos por restaurante/status/data
  - sessões por mesa/status
  - métricas diárias por período
  - mesas por status

## Dados demo e bootstrap
O projeto possui mocks para apresentação local em:
- `src/lib/mocks/basic.ts`

Bootstrap de admin (opcional):
```bash
npm run seed:staff-admin -- --uid <UID_FIREBASE_AUTH> --email <EMAIL> --name "<NOME>" --restaurantId <RESTAURANT_ID>
```

## Qualidade e validação
```bash
npm run lint
npm run typecheck
npm run build
```

## Observações
- O painel usa dados reais do Firebase quando disponíveis.
- Em falha de acesso, módulos críticos usam fallback de dados demo para apresentação.
