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
- `/mesa/[publicToken]` fluxo público principal pelo QR fixo da mesa
- `/m/[sessionToken]` rota legada controlada: não aceita o token antigo e redireciona ao início

### APIs
- `GET /api/health`
- `POST /api/public/session/access`
- `POST /api/public/order`
- `POST /api/public/session/action`
- `GET /api/public/session/state/[sessionToken]` (legado; responde `410` sem consultar dados)
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
cp .env.example .env.local
npm run dev
```

Aplicação:
- Admin: `http://localhost:3000/login`
- Cliente (exemplo): `http://localhost:3000/mesa/<publicToken>`

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

## Bootstrap de admin
Bootstrap de admin (opcional):
```bash
npm run seed:staff-admin -- --uid <UID_FIREBASE_AUTH> --email <EMAIL> --name "<NOME>" --restaurantId <RESTAURANT_ID>
```

`staffUsers` deve usar o UID do Firebase Auth também como ID do documento. Para auditar
cadastros antigos sem alterar dados, execute `npm run audit:staff`. Revise o relatório e,
somente depois, use `npm run audit:staff -- --apply`: o modo de aplicação copia apenas
registros estruturalmente válidos para o ID canônico e preserva o documento de origem.

Após publicar, implante `firestore/firestore.rules` no mesmo projeto Firebase usado pela
aplicação. Confirme externamente que as variáveis Admin estão configuradas; o diagnóstico
do servidor informa apenas quais campos estão ausentes ou mal formatados, nunca valores.

## Qualidade e validação
```bash
npm run lint
npm run typecheck
npm run build
```

## Observações
- O painel usa dados reais do Firebase. Quando não há registros, as telas exibem estados vazios apropriados.
- Pagamentos no QRápido são simulados para fins acadêmicos; não há liquidação bancária real.

## Fluxo do funcionário
1. Acesse `/login` e autentique com uma conta Firebase Auth cadastrada em `staffUsers`.
2. O painel valida o documento ativo do funcionário antes de liberar `/dashboard`.
3. Use **Mesas** para cadastrar/editar mesas, abrir atendimento, gerar QR Code e encerrar sessões.
4. Use **Cardápio** para manter categorias e produtos ativos, disponíveis, destacados, ordenados e com preço em reais.
5. Use **Pedidos** para acompanhar produção, atualizar status e cancelar quando necessário.
6. Use **Relatórios** e **Configurações** para acompanhar indicadores e manter dados operacionais do restaurante.

## Fluxo do cliente
1. O cliente lê o QR Code da mesa em `/mesa/[token]`.
2. O QR fixo identifica somente a mesa. Para liberar cada celular, o cliente solicita presencialmente o código temporário de 6 dígitos gerado a cada abertura.
3. A API valida o código armazenado com hash, limita tentativas de forma persistente e cria uma autorização independente em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
4. O cliente autorizado visualiza apenas campos públicos explicitamente selecionados de categorias e itens ativos/disponíveis.
5. Operações mutáveis exigem também cabeçalho CSRF; IDs enviados pelo navegador nunca substituem o vínculo servidor–restaurante–mesa–atendimento.
6. O carrinho é calculado na interface, mas preços e totais são recalculados no servidor antes da criação do pedido.
7. Ao fechar, bloquear ou expirar o atendimento, autorizações anteriores deixam de ser válidas; o código antigo não é reaproveitado na reabertura.

## Como gerar QR Code e testar uma mesa
1. Crie ou selecione uma mesa no painel administrativo.
2. Abra o atendimento; copie o código temporário exibido uma única vez e informe-o presencialmente aos clientes da mesa.
3. Use a ação de QR Code da mesa para copiar/baixar o QR.
4. Abra a URL gerada em uma janela anônima ou celular.
5. Confirme que a mesa sem sessão mostra o estado vazio apropriado e que mesa ativa carrega o cardápio.
6. Crie pedidos até o limite configurado e valide o bloqueio após atingir o limite.

## Limites e riscos residuais do acesso presencial
- O código vigente pode ser compartilhado por um cliente com terceiros durante o atendimento. O sistema reduz reutilização de QR fotografado, mas não comprova presença física e não promete segurança absoluta.
- Um terceiro que obtenha simultaneamente o QR e o código vigente pode obter sua própria autorização até o atendimento ser encerrado, bloqueado ou expirar.
- O limite persistente de tentativas reduz adivinhação, mas pode ser abusado para bloquear temporariamente novas liberações; a equipe pode encerrar e reabrir o atendimento para renovar o código.
- Não se usa geolocalização, fingerprint ou IP como prova única de presença, e clientes não precisam de login de funcionário.

## Deploy na Vercel
1. Configure todas as variáveis de ambiente no projeto da Vercel.
2. Publique `firestore/firestore.rules` e `firestore/firestore.indexes.json` no Firebase antes do uso real.
3. Execute `npm run build` localmente ou acompanhe o build da Vercel.
4. Defina `NEXT_PUBLIC_APP_URL` com a URL pública de produção para QR Codes corretos.

## Limitações dos pagamentos simulados
- O QR PIX apresentado é acadêmico e não deve ser usado como comprovante bancário.
- Cartões não devem ser digitados na aplicação; a confirmação real deve ocorrer fora do sistema.
- O pedido registra método e modo de pagamento para controle operacional, não liquidação financeira.
