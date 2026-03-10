# QRápido

Sistema web para atendimento presencial via QR Code em restaurantes.

## Stack
- Next.js 14 (App Router)
- TypeScript estrito + Zod
- Tailwind CSS
- Firebase (Auth + Firestore)

## Módulos
- Login de staff/admin com Firebase Auth
- Área administrativa protegida por middleware
- Fluxo cliente sem autenticação (`/m/[sessionId]`)
- Repositórios para leitura/escrita no Firestore com fallback para mock local

## Configuração de ambiente
Crie um `.env.local` com:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Opcional: usar mock local mesmo com Firebase configurado
NEXT_PUBLIC_USE_MOCK_DATA=false

# Opcional: nome do cookie de sessão admin
STAFF_SESSION_COOKIE_NAME=qrapido_staff_session
```

> Segurança: apenas chaves `NEXT_PUBLIC_*` ficam no client. Cookie da área admin é HTTP-only e gerenciado no servidor.

## Estrutura de domínio
Entidades principais tipadas e validadas com Zod em:
- `lib/types/domain.ts`
- `lib/schemas/index.ts`

Repositórios Firestore:
- `lib/services/repositories/base-firestore-repository.ts`
- `lib/services/repositories/domain-repositories.ts`
- `lib/services/repositories.ts` (facade + fallback local)

## Firebase
- Configuração segura: `lib/firebase/env.ts` e `lib/firebase/client.ts`
- Regras iniciais: `firestore/firestore.rules`
- Índices preparados: `firestore/firestore.indexes.json`
- Seed local de referência: `firestore/seed.local.json`

## Executar localmente
```bash
npm install
npm run dev
```

Login staff: `/login`.
Painel: `/admin/*`.

## Qualidade
```bash
npm run lint
npm run typecheck
npm run build
```
