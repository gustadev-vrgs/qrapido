# QRápido

Atendimento em restaurante pelo QR Code da mesa: o cliente vê o cardápio no celular, faz pedidos e chama o garçom; a equipe acompanha mesas, pedidos e cozinha num painel em tempo real.

Projeto de extensão (Engenharia de Software), gratuito para pequenos restaurantes.

## Como funciona

1. **Cada mesa tem um QR Code fixo** (impresso uma vez). Ler o QR abre o cardápio da mesa — mesmo com a mesa fechada, o cliente já pode olhar o cardápio e montar o carrinho.
2. **A equipe abre a mesa** quando os clientes sentam (Mesas → Abrir mesa). O sistema gera um **código de 6 dígitos**, que fica visível no card da mesa.
3. **O cliente digita o código** no celular uma vez. A partir daí ele (e quem estiver na mesa com o mesmo código) pode pedir quantas vezes quiser, acompanhar os pedidos e chamar o garçom.
4. **A cozinha** recebe o pedido em Pedidos (com aviso sonoro) e avança: em preparo → pronto → entregue. O cliente vê o status no celular.
5. **A equipe encerra a mesa** depois que a conta é paga. Os celulares deixam de pedir e o próximo cliente recebe um código novo.

Por que um código além do QR? O QR fica colado na mesa e pode ser fotografado; o código muda a cada atendimento e só quem está no restaurante o recebe, evitando pedidos falsos de fora.

## Primeiros passos (do zero até o primeiro pedido)

### 1. Firebase
1. Crie um projeto em <https://console.firebase.google.com>.
2. **Authentication** → Método de login → ative **E-mail/senha** → aba Usuários → **Adicionar usuário** (será o administrador). Copie o **UID**.
3. **Firestore Database** → Criar banco (modo produção).
4. **Configurações do projeto → Geral → Seus apps → Web**: registre um app e copie a configuração (`apiKey`, `authDomain`...).
5. **Configurações do projeto → Contas de serviço → Gerar nova chave privada**: baixa um arquivo `.json` (guarde, não publique no GitHub).

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` (local) e preencha as mesmas variáveis na **Vercel → Settings → Environment Variables**:
- `NEXT_PUBLIC_FIREBASE_*`: configuração do app Web (passo 1.4).
- `FIREBASE_SERVICE_ACCOUNT`: cole o **conteúdo inteiro** do `.json` da conta de serviço (passo 1.5). Alternativa: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`.
- `NEXT_PUBLIC_APP_URL`: pode ficar vazio (o painel usa o próprio endereço nos QR Codes). Se preencher, use o endereço real da Vercel.

Depois de mudar variáveis na Vercel, faça **Redeploy**.

### 3. Regras e índices do Firestore
Na pasta do projeto:
```bash
npm install
npm run firebase:deploy -- --project SEU_PROJECT_ID
```
(Na primeira vez pede login: `npx firebase-tools login`.) Sem as regras publicadas, o painel mostra erros de permissão. Alternativa manual: Firestore → Regras → colar `firestore/firestore.rules` → Publicar.

### 4. Cadastrar o administrador
O usuário do passo 1.2 precisa de um documento em `staffUsers` com o **mesmo UID**:
```bash
npm run seed:staff-admin -- --uid <UID> --email <EMAIL> --name "<NOME>" --restaurantId <ID_DO_RESTAURANTE>
```
`<ID_DO_RESTAURANTE>` é um identificador seu, sem espaços (ex.: `cantina-da-praca`). Ou crie à mão no console: coleção `staffUsers`, ID do documento = UID, campos `uid`, `email`, `name`, `role: "admin"`, `restaurantId`, `isActive: true`.

### 5. No painel
1. Entre em `/login` e abra **Diagnóstico**. Tudo deve ficar verde; se algo faltar, a página explica como corrigir. Use **Corrigir automaticamente** para criar o cadastro do restaurante e as configurações padrão.
2. **Cardápio**: crie uma categoria e alguns produtos.
3. **Mesas → Nova mesa** → **QR Code** → imprimir (ou "Testar" para abrir no navegador).
4. **Abrir mesa** → leia o QR com o celular → digite o código → faça um pedido → veja chegar em **Pedidos**.

## Painel
| Tela | Para quê | Quem acessa |
|---|---|---|
| Dashboard | Resumo do dia e chamados de garçom | todos |
| Pedidos | Fila da cozinha em tempo real, com som | todos |
| Mesas | Abrir/encerrar mesas, código, QR Code | todos (cadastrar/editar mesas: admin e gerente) |
| Cardápio | Categorias e produtos | admin, gerente |
| Relatórios | Faturamento, produtos, mesas, cancelamentos | admin, gerente |
| Configurações | Nome, pagamentos, taxa de serviço, tempo de atendimento | admin, gerente |
| Diagnóstico | Verifica servidor, regras, dados e índices | admin, gerente |

Cargos (`role` em `staffUsers`): `admin`, `manager` (gerente), `attendant` (atendente), `kitchen` (cozinha).

## Problemas comuns
- **"QR Code inválido" ao ler o QR**: mesa criada por uma versão antiga. Diagnóstico → Corrigir automaticamente → imprima o QR de novo.
- **QR abre `localhost` ou `seu-dominio`**: ajuste/remova `NEXT_PUBLIC_APP_URL` na Vercel e faça redeploy. O aviso aparece em Mesas.
- **"O Firestore recusou o acesso" no painel**: regras não publicadas (passo 3) ou usuário sem `staffUsers` correto (passo 4).
- **"Servidor sem credenciais" / "outro projeto Firebase"**: `FIREBASE_SERVICE_ACCOUNT` ausente ou de outro projeto. Veja Diagnóstico.
- **Relatórios pedem índice**: o Diagnóstico mostra o link para criar o índice (ou rode o passo 3).
- Os logs de erro do servidor ficam em **Vercel → Logs**, com o mesmo `requestId` mostrado na tela.

## Desenvolvimento
```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # testes de regras + fluxo completo com Firebase simulado
npm run build
```
Os testes de `tests/integration` executam as rotas reais da API contra um Firestore em memória (`tests/fakes/firebase-admin.ts`), sem índices compostos publicados — garantindo que o fluxo do cliente funcione num projeto novo.

### Estrutura
- `src/app/mesa/[token]` — página do cliente (QR).
- `src/app/(dashboard)/dashboard/*` — painel.
- `src/app/api/public/*` — APIs do cliente (cookie `HttpOnly` + token CSRF por celular).
- `src/app/api/admin/*` — APIs da equipe (token do Firebase Auth + cargo).
- `src/lib/server/*` — sessão da mesa, segurança e tratamento de erros.
- `firestore/` — regras e índices; `firebase.json` aponta para eles.

## Segurança (resumo)
- Preços e totais são recalculados no servidor; pedidos têm chave de idempotência (não duplicam se a internet cair) e limite de frequência.
- O código da mesa é verificado por hash; tentativas são limitadas por IP e mesa.
- Criar e mover pedidos só é possível pelas APIs do servidor; as regras bloqueiam escrita direta.
- O código atual de cada mesa fica legível apenas para a equipe do restaurante (regras do Firestore).
- Pagamentos são **simulados** (projeto acadêmico): nenhum valor é cobrado de verdade.

### Limites conhecidos
- Quem tiver o QR e o código vigente consegue pedir até a mesa ser encerrada; a equipe pode gerar um novo código a qualquer momento.
- O sistema não comprova presença física (não usa geolocalização).
