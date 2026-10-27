# iTech Celular e Informática — Sistema de Gestão

Sistema completo de gestão para a loja de conserto de celulares e informática **iTech Celular e Informática**: autenticação com papéis (administrador/funcionário), clientes, ordens de serviço, garantias, fiados, retiradas de caixa, dashboard com gráficos, impressão de OS, integração com WhatsApp e relatórios.

## Stack

- **Frontend:** React + Vite + Tailwind CSS + Chart.js + Lucide Icons
- **Backend:** Node.js + Express + JWT + bcrypt
- **Banco de dados:** SQLite (via `better-sqlite3`) — arquivo local, sem necessidade de instalar servidor de banco

> O pedido original citava MySQL como preferência. Optei por SQLite porque roda localmente sem precisar instalar/configurar um servidor MySQL — é o mesmo banco usado no seu projeto anterior. A camada de acesso ao banco fica isolada em `backend/db/database.js`, então migrar para MySQL depois é possível sem reescrever as rotas.

## Como rodar como programa do computador (recomendado para uso no dia a dia)

Isso deixa o sistema funcionando com um duplo clique, sem precisar abrir o VSCode nem digitar comando nenhum depois da primeira vez.

**Passo 1 — Só uma vez, para preparar tudo:**
No VSCode, abra um terminal na pasta `itech-erp` (Terminal → Novo Terminal) e rode:
```
build.bat
```
Isso instala tudo, gera a versão final do site e já deixa pronta dentro do backend. Pode demorar alguns minutos na primeira vez.

**Passo 2 — Sempre que for usar o sistema:**
Dê duplo clique no arquivo `iniciar.bat` (dentro da pasta `itech-erp`, no Explorador de Arquivos do Windows — não precisa estar no VSCode). Uma janela preta abre e o navegador abre sozinho em `http://localhost:4001`.

Para **fechar o sistema**, é só fechar aquela janela preta.

Se você editar o código do frontend depois, rode `build.bat` de novo para atualizar; para mudanças no backend não precisa, só reabrir o `iniciar.bat`.

**Acesso de outros aparelhos na mesma rede Wi-Fi (ex: celular na loja):**
1. No computador que está rodando o sistema, descubra o IP local: abra o Prompt de Comando e digite `ipconfig`, procure "Endereço IPv4" (algo como `192.168.0.15`).
2. No celular/outro PC (conectado na mesma Wi-Fi), acesse `http://192.168.0.15:4001` (troque pelo IP real).
3. Isso só funciona enquanto o computador estiver ligado e o `iniciar.bat` estiver rodando, e só dentro da mesma rede — não funciona pela internet fora de casa/loja.

Usuário padrão criado na primeira vez que o sistema roda:
- **usuário:** `admin`
- **senha:** `admin123`

**Troque essa senha assim que possível** (em Usuários e Sistema → Usuários, após o primeiro login).

## Como rodar em modo de desenvolvimento (para mexer no código)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run seed     # cria o usuário administrador inicial
npm run dev       # inicia o servidor em http://localhost:4001
```

### 2. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev        # inicia em http://localhost:5174
```

Abra `http://localhost:5174` no navegador. O Vite já está configurado para redirecionar `/api` para o backend em `localhost:4001`.

## O que está implementado

- Login com JWT, senha com hash bcrypt, papéis Administrador/Funcionário com permissões diferentes (funcionário não vê lucro, retiradas de caixa, não gerencia usuários e não exclui registros)
- Log de auditoria (usuário, ação, data/hora, registro afetado) — visível em Usuários e Sistema → Log de Ações
- Dashboard com cards (receita, receita pendente, lucro, retiradas, fiados em aberto, reparos por status) e gráficos (receita diária, receita/lucro mensal, distribuição de status)
- Cadastro de clientes com busca instantânea, edição e histórico completo (reparos, total gasto, última visita)
- Ordens de serviço com número sequencial automático (SO-000001...), cálculo automático de lucro, regras automáticas de status de pagamento por forma de pagamento (PIX/Dinheiro/Cartão → pago; Fiado → cria conta de fiado; Não Realizado → vermelho)
- Geração automática de garantia quando a OS é marcada como "Entregue"
- Impressão de OS em formato A4 profissional
- Botão de WhatsApp (abre `wa.me` com o cliente, aparelho e valor pré-preenchidos) quando a OS está "Pronta para Retirada"
- Módulo de garantias com alerta de vencimento em 7 dias
- Módulo de fiados com marcação de pago (atualiza receita automaticamente)
- Retiradas de caixa (somente administrador)
- Busca global no topo (clientes, OS, garantias, fiados)
- Exportação de backup em JSON (Usuários e Sistema → Backup)
- Relatórios agregados por período/cliente/técnico/forma de pagamento no backend (`GET /api/reports/service-orders`, `/api/reports/profit`)
- Modo claro/escuro

## Simplificações em relação ao pedido original

Documentando por transparência, para você decidir se quer que eu aprofunde algum destes pontos depois:

- **WhatsApp:** usa o link `wa.me` (abre o WhatsApp Web/app com a mensagem pronta). A API oficial do WhatsApp Business exige conta aprovada pela Meta e credenciais próprias — não configurei isso aqui.
- **Exportar para Excel/PDF:** o backup exporta em JSON; não implementei geração de `.xlsx`/`.pdf` para os relatórios (posso adicionar se for importante).
- **Restaurar backup:** só a exportação está pronta; a rotina de restauração (importar o JSON de volta) ainda não existe.
- **MySQL:** o banco é SQLite, como explicado acima.

## Estrutura de pastas

```
itech-erp/
  backend/
    db/           # conexão SQLite, schema e seed do admin
    middleware/    # autenticação JWT e checagem de papel
    routes/        # auth, users, customers, service-orders, warranties, credit-accounts, cash-withdrawals, dashboard, reports
    utils/         # log de auditoria, gerador de número de OS
    server.js
  frontend/
    src/
      api/         # cliente axios com JWT
      components/  # Sidebar, Header, cards, seletor de cliente
      context/     # autenticação e tema claro/escuro
      pages/        # todas as telas do sistema
```
