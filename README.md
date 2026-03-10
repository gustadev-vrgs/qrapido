# QRápido

Base inicial do projeto **QRápido** com Next.js App Router, TypeScript estrito, Tailwind e design system premium.

## Stack

- Next.js 14 (App Router)
- TypeScript (`strict: true`)
- Tailwind CSS
- Sonner (toasts)
- next-themes (tema)
- class-variance-authority + clsx + tailwind-merge

## Como rodar

```bash
npm install
npm run dev
```

## Rotas implementadas

- `/login`
- `/dashboard`
- `/dashboard/pedidos`
- `/dashboard/mesas`
- `/dashboard/cardapio`
- `/dashboard/relatorios`
- `/dashboard/configuracoes`
- `/m/[sessionToken]`

## Estrutura base

- `app/`: rotas e layouts
- `components/`: UI e layouts reutilizáveis
- `lib/constants`: constantes globais
- `lib/types`: tipos compartilhados
- `lib/utils`: utilitários base
- `lib/hooks`: hooks de suporte
