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
1. Copie `env.example` para `.env.local`.
2. Preencha as variáveis de Client SDK (`NEXT_PUBLIC_*`) para autenticação no front-end.
3. Preencha as variáveis de Admin SDK (`FIREBASE_*`) apenas no ambiente servidor.
4. Para `FIREBASE_PRIVATE_KEY`, mantenha quebras de linha escapadas como `\\n` (o parser converte em runtime).



### Bootstrap de admin em `staffUsers`
Use o script abaixo para criar/atualizar o staff admin sem depender do Firebase Console:

```bash
npm run seed:staff-admin -- --uid <UID_FIREBASE_AUTH> --email <EMAIL> --name "<NOME>" --restaurantId <RESTAURANT_ID>
```

O script:
- valida se o UID existe no Firebase Auth;
- faz upsert em `staffUsers/{uid}` com `role: "admin"` e `isActive: true`;
- usa credenciais via `FIREBASE_*` (service account) ou ADC (`GOOGLE_APPLICATION_CREDENTIALS`).

### staffUsers para login administrativo
Para o login admin funcionar, o usuário precisa existir no Firebase Auth **e** ter documento ativo em `staffUsers` com estes campos mínimos:
- `uid` (igual ao UID do Firebase Auth)
- `email` (recomendado em minúsculas)
- `name`
- `role`
- `restaurantId`
- `isActive` (`true`)

A validação tenta primeiro por `uid` e usa fallback por e-mail normalizado (`trim().toLowerCase()`).

Arquivos base:
- `src/lib/firebase/client.ts`: inicialização singleton do Firebase Client SDK (Auth + Firestore).
- `src/lib/firebase/admin.ts`: inicialização singleton do Firebase Admin SDK com credenciais seguras.
- `src/lib/firebase/auth.ts`: helpers de Auth admin e verificação de bearer token para Route Handlers.
- `src/lib/firebase/firestore.ts`: helpers para obtenção de Firestore client/admin.
- `firestore/firestore.rules` e `firestore/firestore.indexes.json`: regras e índices do Firestore.

## Deploy
Projeto pronto para Vercel.
