# QRápido

Sistema web completo para atendimento presencial via QR Code em restaurantes.

## Stack
- Next.js 14 (App Router)
- TypeScript estrito
- Tailwind CSS
- Firebase (Auth + Firestore)
- Deploy Vercel

## Módulos entregues
- Login de staff/admin
- Dashboard operacional
- Gestão de mesas, sessões, pedidos, cardápio
- Relatórios e configurações
- Geração de QR por mesa
- Fluxo mobile para cliente sem login
- Ações de chamar garçom e pedir conta
- Proteções iniciais: expiração de sessão, rate limit e dedupe

## Entidades previstas
- restaurants
- staffUsers
- tables
- tableSessions
- menuCategories
- menuItems
- orders
- orderEvents
- restaurantSettings
- dailyMetrics

## Executar localmente
```bash
npm install
npm run dev
```

Acesso staff: `/login`.
Fluxo cliente: `/m/[sessionId]`.

## Qualidade
```bash
npm run lint
npm run typecheck
npm run build
```

## Firebase
- Configuração cliente em `lib/firebase/client.ts`
- Regras em `firestore/firestore.rules`
- Índices em `firestore/firestore.indexes.json`

## Deploy
Projeto pronto para Vercel.
