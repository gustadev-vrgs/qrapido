# QRápido

Atendimento em restaurante pelo QR Code da mesa: o cliente vê o cardápio no celular, faz pedidos e chama o garçom; a equipe acompanha mesas, pedidos e cozinha num painel em tempo real.

Projeto de extensão (Engenharia de Software), gratuito para pequenos restaurantes.

## Como funciona

1. **Cada mesa tem um QR Code fixo** (impresso uma vez e colado na mesa). Ler o QR abre o cardápio — mesmo com a mesa fechada, o cliente já pode olhar e montar o carrinho.
2. **A equipe abre a mesa com 1 toque** (Mesas → Abrir). O sistema gera um **código de 6 dígitos**, que fica visível na mesa no painel.
3. **O cliente digita o código** no celular uma vez e pede quantas vezes quiser, chama o garçom e pede a conta. Quem não quiser usar o celular faz o pedido com o garçom (Mesas → mesa → **Lançar pedido**).
4. **Pratos vão para a Cozinha** (aviso sonoro, um toque em **Pronto**); **bebidas** e itens de pronta entrega vão direto para o **Salão**, sem etapa de preparo.
5. **O garçom leva** o que aparece em Salão → Levar à mesa (marcar "Levei" é opcional).
6. **O caixa fecha a conta** (Mesas → mesa → Fechar conta, escolhendo PIX/dinheiro/cartão). Tudo vira entregue, os celulares deixam de pedir e o próximo cliente recebe um código novo.

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

### 4. Cadastrar o administrador (só o primeiro)
O restante da equipe é cadastrado depois pelo próprio painel, em **Equipe**. O usuário do passo 1.2 precisa de um documento em `staffUsers` com o **mesmo UID**:
```bash
npm run seed:staff-admin -- --uid <UID> --email <EMAIL> --name "<NOME>" --restaurantId <ID_DO_RESTAURANTE>
```
`<ID_DO_RESTAURANTE>` é um identificador seu, sem espaços (ex.: `cantina-da-praca`). Ou crie à mão no console: coleção `staffUsers`, ID do documento = UID, campos `uid`, `email`, `name`, `role: "admin"`, `restaurantId`, `isActive: true`.

**Novos restaurantes, sem terminal:** defina `PLATFORM_ADMIN_EMAILS` na Vercel com o seu e-mail e faça Redeploy. Em `/plataforma`, entre com esse e-mail (a página pede para confirmá-lo na primeira vez) e cadastre o restaurante com o nome, um identificador (ex.: `cantina-da-ana`) e o e-mail e a senha inicial do administrador. O sistema cria o cadastro do restaurante, as configurações padrão e o login do administrador.

### 5. No painel
1. Entre em `/login` e abra **Diagnóstico**. Tudo deve ficar verde; se algo faltar, a página explica como corrigir. Use **Corrigir automaticamente** para criar o cadastro do restaurante e as configurações padrão.
2. **Cardápio → Categorias**: crie as seções (há sugestões como Pratos feitos e Bebidas). Depois **Novo item**: preço, foto, opções (acompanhamento, adicionais) e, se for prato do dia, os dias da semana.
3. **Equipe**: cadastre garçons, caixa e cozinha (e-mail, senha e função).
4. **Mesas → Nova mesa** → abrir a mesa → **QR Code** → imprimir (ou "Testar" para abrir no navegador).
5. **Abrir** → leia o QR com o celular → digite o código → faça um pedido → veja chegar em **Cozinha** e **Salão**.

## Painel
| Tela | Para quê | Quem acessa |
|---|---|---|
| Início | Resumo do dia e chamados de garçom | todos (a cozinha vai direto para Cozinha) |
| Salão | Chamados, o que levar às mesas e o que ainda está na cozinha (celular do garçom) | admin, gerente, atendente |
| Cozinha | Fila de comandas com tempo de espera, "Pronto", "Acabou algo?" e impressão da comanda (botão ou automática no aparelho da impressora) | todos |
| Mesas | Abrir mesa, código, conta, fechar conta (inclusive dividida em mais de uma forma), lançar pedido, QR Code, histórico | admin, gerente, atendente |
| Caixa | Fechamento do dia: recebido por forma de pagamento, mesas em aberto, cortesias e cancelamentos; imprimível | admin, gerente, atendente |
| Pedidos | Todos os pedidos do dia, busca e cancelamento | todos |
| Cardápio | Categorias, itens, opções, prato do dia, foto, esgotado | admin, gerente |
| Equipe | Cadastrar pessoas, função, senha e tirar acesso | admin, gerente (só admin cria admin) |
| Relatórios | Faturamento, produtos, mesas, cancelamentos | admin, gerente |
| Configurações | Nome, pagamentos, taxa de serviço, tempo de atendimento | admin, gerente |
| Diagnóstico | Verifica servidor, regras, dados e índices | admin, gerente |

Cargos (`role` em `staffUsers`): `admin`, `manager` (gerente), `attendant` (atendente/garçom/caixa), `kitchen` (cozinha).

**Impressão automática da comanda:** no tablet ligado à impressora térmica, abra Cozinha e ative "Imprimir ao chegar". O navegador mostra a janela de impressão a cada pedido; para imprimir direto, abra o Chrome com `--kiosk-printing` e defina a impressora térmica como padrão.

**Fotos dos pratos** são reduzidas no aparelho e guardadas no próprio Firestore (coleção `menuImages`, acessada só pelo servidor) — não é preciso ativar o Firebase Storage.

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
- `src/app/page.tsx` — redireciona a raiz para o login.
- `src/app/mesa/[token]` — página do cliente (QR).
- `src/app/(dashboard)/dashboard/*` — painel.
- `src/app/plataforma` — área do dono da plataforma (cadastro de restaurantes); APIs em `src/app/api/platform`.
- `src/app/api/public/*` — APIs do cliente (cookie `HttpOnly` + token CSRF por celular).
- `src/app/api/admin/*` — APIs da equipe (token do Firebase Auth + cargo).
- `src/lib/server/*` — sessão da mesa, montagem do pedido (`place-order.ts`, usada pelo cliente e pelo garçom), segurança e tratamento de erros.
- `firestore/` — regras e índices; `firebase.json` aponta para eles.

## Segurança (resumo)
- Preços e totais são recalculados no servidor; pedidos têm chave de idempotência (não duplicam se a internet cair) e limite de frequência.
- O código da mesa é verificado por hash; tentativas são limitadas por IP e mesa.
- Criar e mover pedidos só é possível pelas APIs do servidor; as regras bloqueiam escrita direta.
- O código atual de cada mesa fica legível apenas para a equipe do restaurante (regras do Firestore).
- O sistema não cobra ninguém: o caixa registra como a conta foi paga (PIX, dinheiro, cartão) ao fechar a mesa.
- Dependências atualizadas (Next.js 15, React 19, Firebase 13): `npm audit --omit=dev` sem vulnerabilidades.

### Limites conhecidos
- Quem tiver o QR e o código vigente consegue pedir até a mesa ser encerrada; a equipe pode gerar um novo código a qualquer momento.
- O sistema não comprova presença física (não usa geolocalização).
