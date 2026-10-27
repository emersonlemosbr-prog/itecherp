# Correcao OS e retirada de caixa - 22/09/2026

Causa: exigencia de fornecedor no formulario e backend; servico e backfill ignoravam OS sem fornecedor. Atualizacoes de custo/fornecedor eram bloqueadas e a insercao ignorava conflitos sem atualizar valores.

Corrigido: fornecedor opcional; sincronizacao na entrega; atualizacao do mesmo ID para custo/fornecedor; exclusao somente da retirada automatica ao zerar custo. Mantido indice unico por service_order_id com source_type=service_order_part. A data de uma retirada existente permanece preservada. Reabrir uma OS preserva a retirada; nova entrega sincroniza o registro existente.

Banco: sem nova migracao estrutural. Backup SQLite consistente em backend/db/backups/before-part-withdrawal-repair-20260922.db. Reparo criou 96 retiradas (R$ 6.608,90), IDs 22 a 117, preservando 9 existentes. Nenhuma retirada manual encontrada. Reexecucao criou zero; zero faltantes e duplicidades. Historico financeiro recalculado; integridade SQLite OK. Receita e lucro da OS nao foram modificados pelo backfill. Custos automaticos ja incluidos no lucro nao sao descontados novamente.

Arquivos fonte alterados:
- backend/services/serviceOrderPartWithdrawal.js
- backend/routes/serviceOrders.js
- backend/scripts/backfillServiceOrderPartWithdrawals.js
- backend/tests/serviceOrderPartWithdrawal.test.js
- frontend/src/pages/ServiceOrderForm.jsx

Build gerado em frontend/dist e publicado em backend/public (index.html e assets). Backup do index anterior em tmp/part-withdrawal-public-backup.

Validacao: suite backend 23/23; testes da integracao repetidos apos ajuste final 2/2; build frontend OK (aviso de tamanho de chunks). Cobertos os nove cenarios solicitados, fornecedor ausente, restricao de exclusao manual de retirada automatica, persistencia SQLite, reentrega e calculo financeiro. HTTP real GET /api/cash-withdrawals retornou 200 e as 96 retiradas com links de OS; health OK. Nao foi realizado teste visual no navegador nem alteracao de OS real para teste.

PENDENCIA OPERACIONAL: backend ativo PID 7708 ainda executa codigo anterior. Stop-Process foi recusado pelo Windows com Acesso negado. E necessario reiniciar o backend administrativo com privilegios administrativos para ativar a sincronizacao corrigida. Frontend novo e backfill ja aplicados; ate reiniciar, a API antiga ainda pode rejeitar correcoes de custo/fornecedor. Nao houve bloqueio por revisao automatica de aprovacao.

Evidencias: tmp/part-withdrawal-audit-before.json, tmp/part-withdrawal-repair.json, tmp/part-withdrawal-recheck.json, tmp/part-withdrawal-financial-validation.json.

## Retiradas criadas

| Retirada | ID OS | Numero OS | Valor | Data |
|---|---|---|---|---|
| 22 | 1 | SO-000001 | 55.00 | 2026-07-17 |
| 23 | 2 | SO-000002 | 60.00 | 2026-07-17 |
| 24 | 3 | SO-000003 | 50.00 | 2026-07-17 |
| 25 | 4 | SO-000004 | 65.00 | 2026-07-18 |
| 26 | 5 | SO-000005 | 85.00 | 2026-07-18 |
| 27 | 7 | SO-000007 | 65.00 | 2026-07-17 |
| 28 | 8 | SO-000008 | 2.50 | 2026-07-17 |
| 29 | 9 | SO-000009 | 100.00 | 2026-07-18 |
| 30 | 10 | SO-000010 | 260.00 | 2026-07-20 |
| 31 | 12 | SO-000012 | 70.00 | 2026-07-21 |
| 32 | 13 | SO-000013 | 40.00 | 2026-07-29 |
| 33 | 14 | SO-000014 | 75.00 | 2026-07-21 |
| 34 | 15 | SO-000015 | 450.00 | 2026-08-08 |
| 35 | 17 | SO-000016 | 60.00 | 2026-07-22 |
| 36 | 18 | SO-000017 | 55.00 | 2026-07-23 |
| 37 | 19 | SO-000018 | 1.00 | 2026-07-23 |
| 38 | 20 | SO-000019 | 50.00 | 2026-07-25 |
| 39 | 21 | SO-000020 | 200.00 | 2026-07-31 |
| 40 | 22 | SO-000021 | 70.00 | 2026-07-28 |
| 41 | 24 | SO-000023 | 70.00 | 2026-07-31 |
| 42 | 26 | SO-000025 | 99.99 | 2026-08-10 |
| 43 | 27 | SO-000026 | 60.00 | 2026-07-30 |
| 44 | 28 | SO-000027 | 60.00 | 2026-07-29 |
| 45 | 29 | SO-000028 | 50.00 | 2026-07-30 |
| 46 | 30 | SO-000029 | 60.00 | 2026-07-31 |
| 47 | 31 | SO-000030 | 50.00 | 2026-08-05 |
| 48 | 32 | SO-000031 | 60.00 | 2026-08-05 |
| 49 | 33 | SO-000032 | 75.00 | 2026-07-31 |
| 50 | 34 | SO-000033 | 60.00 | 2026-08-05 |
| 51 | 35 | SO-000034 | 60.00 | 2026-07-30 |
| 52 | 37 | SO-000036 | 80.00 | 2026-07-31 |
| 53 | 38 | SO-000037 | 69.99 | 2026-08-05 |
| 54 | 39 | SO-000038 | 60.00 | 2026-08-05 |
| 55 | 40 | SO-000039 | 60.00 | 2026-08-07 |
| 56 | 41 | SO-000040 | 50.00 | 2026-08-06 |
| 57 | 42 | SO-000041 | 70.00 | 2026-08-06 |
| 58 | 43 | SO-000042 | 70.00 | 2026-08-05 |
| 59 | 50 | SO-000044 | 5.00 | 2026-08-06 |
| 60 | 51 | SO-000045 | 5.00 | 2026-08-05 |
| 61 | 55 | SO-000049 | 100.00 | 2026-07-22 |
| 62 | 56 | SO-000050 | 260.00 | 2026-08-10 |
| 63 | 57 | SO-000051 | 100.00 | 2026-08-14 |
| 64 | 58 | SO-000052 | 70.00 | 2026-08-15 |
| 65 | 59 | SO-000053 | 70.00 | 2026-08-17 |
| 66 | 60 | SO-000054 | 75.00 | 2026-08-19 |
| 67 | 61 | SO-000055 | 75.00 | 2026-08-21 |
| 68 | 62 | SO-000056 | 70.00 | 2026-08-22 |
| 69 | 63 | SO-000057 | 100.00 | 2026-08-23 |
| 70 | 64 | SO-000058 | 70.00 | 2026-08-24 |
| 71 | 65 | SO-000059 | 90.00 | 2026-08-24 |
| 72 | 66 | SO-000060 | 110.00 | 2026-08-24 |
| 73 | 67 | SO-000061 | 4.34 | 2026-08-24 |
| 74 | 68 | SO-000062 | 170.00 | 2026-08-24 |
| 75 | 69 | SO-000063 | 4.34 | 2026-08-22 |
| 76 | 70 | SO-000064 | 4.34 | 2026-08-24 |
| 77 | 71 | SO-000065 | 4.34 | 2026-08-24 |
| 78 | 72 | SO-000066 | 100.00 | 2026-08-26 |
| 79 | 73 | SO-000067 | 60.00 | 2026-08-27 |
| 80 | 74 | SO-000068 | 3.50 | 2026-08-26 |
| 81 | 75 | SO-000069 | 10.00 | 2026-08-27 |
| 82 | 76 | SO-000070 | 60.00 | 2026-08-28 |
| 83 | 79 | SO-000072 | 80.00 | 2026-08-28 |
| 84 | 80 | SO-000073 | 90.00 | 2026-09-01 |
| 85 | 81 | SO-000074 | 3.57 | 2026-08-28 |
| 86 | 82 | SO-000075 | 1.00 | 2026-08-29 |
| 87 | 84 | SO-000077 | 60.00 | 2026-09-01 |
| 88 | 86 | SO-000079 | 70.00 | 2026-09-01 |
| 89 | 88 | SO-000081 | 120.00 | 2026-09-01 |
| 90 | 91 | SO-000084 | 140.00 | 2026-09-01 |
| 91 | 101 | SO-000085 | 139.99 | 2026-09-02 |
| 92 | 102 | SO-000086 | 4.50 | 2026-09-03 |
| 93 | 103 | SO-000087 | 2.50 | 2026-09-02 |
| 94 | 104 | SO-000088 | 70.00 | 2026-09-02 |
| 95 | 105 | SO-000089 | 1.00 | 2026-09-02 |
| 96 | 106 | SO-000090 | 80.00 | 2026-09-03 |
| 97 | 107 | SO-000091 | 100.00 | 2026-09-03 |
| 98 | 108 | SO-000092 | 50.00 | 2026-09-04 |
| 99 | 109 | SO-000093 | 60.00 | 2026-09-04 |
| 100 | 110 | SO-000094 | 110.00 | 2026-09-04 |
| 101 | 111 | SO-000095 | 60.00 | 2026-09-04 |
| 102 | 112 | SO-000096 | 3.50 | 2026-09-04 |
| 103 | 114 | SO-000098 | 70.00 | 2026-09-04 |
| 104 | 116 | SO-000100 | 0.50 | 2026-09-05 |
| 105 | 125 | SO-000106 | 70.00 | 2026-09-08 |
| 106 | 128 | SO-000107 | 90.00 | 2026-09-09 |
| 107 | 133 | SO-000109 | 110.00 | 2026-09-09 |
| 108 | 135 | SO-000111 | 70.00 | 2026-09-09 |
| 109 | 136 | SO-000112 | 1.00 | 2026-09-10 |
| 110 | 137 | SO-000113 | 70.00 | 2026-09-11 |
| 111 | 140 | SO-000115 | 3.50 | 2026-09-11 |
| 112 | 145 | SO-000120 | 1.00 | 2026-09-14 |
| 113 | 147 | SO-000122 | 70.00 | 2026-09-17 |
| 114 | 151 | SO-000126 | 55.00 | 2026-09-15 |
| 115 | 154 | SO-000129 | 60.00 | 2026-09-16 |
| 116 | 155 | SO-000130 | 2.50 | 2026-09-15 |
| 117 | 157 | SO-000132 | 90.00 | 2026-09-16 |
