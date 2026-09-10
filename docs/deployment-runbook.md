# Implantação, rollback e homologação

## Configuração externa pendente

1. Crie projetos Firebase **separados** para homologação e produção. Ative Email/Senha no Auth e crie os usuários de equipe; execute `npm run seed:staff-admin` com o UID correto.
2. Na Vercel, configure Production, Preview e Development separadamente com as variáveis de `.env.example`. Use uma service account de privilégio mínimo somente no servidor; nunca prefixe credenciais Admin com `NEXT_PUBLIC_`.
3. Defina `NEXT_PUBLIC_APP_URL` com o domínio canônico do ambiente. Cadastre esse domínio em Firebase Auth > Authorized domains.
4. Antes de implantar, selecione explicitamente o projeto (`firebase use <id-homologacao>`), revise o diff e publique manualmente `firebase deploy --only firestore:rules,firestore:indexes`. Esta validação não publica infraestrutura nem dados.
5. Na Vercel, implante primeiro em Preview, execute o roteiro abaixo e então promova o mesmo commit. Guarde o deployment anterior.

## Validação e pós-deploy

Execute `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:emulator`, `npm run test:e2e`, `npm run build` e `npm run security:secrets`. O emulador usa o projeto fictício `qrapido-ci` e não aceita credenciais de produção.

Em desktop e celular reais, confirme ausência de erros no console e execute: funcionário autorizado abre mesa; dois navegadores obtêm autorizações distintas com o código temporário; pedido aparece na cozinha e sua transição aparece no cliente; chamado é atendido e concluído; cancelamento libera a cota exatamente uma vez; renovação mantém o atendimento; expiração bloqueia mutações; fechamento recusa pedidos pendentes, revoga os acessos e permite reabrir com novo código; o cookie antigo falha; relatório e CSV contêm todos os pedidos do período. Repita tentativas inválidas e pedidos rápidos até observar `429`, sem bloquear o outro aparelho. Tente IDs de outra mesa/restaurante e alteração de preço/total e confirme recusa.

Registre evidências (status HTTP, screenshots sem dados pessoais, console e IDs de correlação), sem copiar tokens, cookies ou códigos. Monitore erros 5xx, recusas de índice e latência do Firestore após promover.

## Rollback

1. Na Vercel, use **Promote to Production** no deployment estável anterior; não faça novo build durante o incidente.
2. Regras e índices são compatibilidade de dados: restaure uma versão anterior somente depois de verificar que ela não reabre acesso indevido. Use o arquivo do commit estável e `firebase deploy --only firestore:rules,firestore:indexes --project <id>`.
3. Não apague coleções para rollback. Para mudança incompatível, faça correção aditiva e migração auditável; preserve pedidos e eventos.
4. Se uma credencial foi exposta, revogue/rotacione no Firebase/Google Cloud e atualize a Vercel antes de reimplantar. Remover o texto do Git não revoga o segredo.

## Cobertura e riscos remanescentes

Os testes automatizados cobrem regras por função/tenant e o fluxo HTTP real de abertura, acesso independente, adulteração cross-tenant, preço recalculado, idempotência e chamado duplicado. O ciclo visual completo, atualização em tempo real entre cozinha/cliente, conclusão de chamado, cancelamento/cota, expiração/renovação/fechamento/reabertura e relatório integral ainda exigem a homologação manual descrita acima. Pagamentos permanecem simulados; não constituem confirmação financeira. O código presencial pode ser compartilhado e os limites podem causar negação temporária a clientes legítimos.
