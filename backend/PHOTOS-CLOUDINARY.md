# Fotos das Ordens de Serviço

O backend recebe arquivos reais em `POST /api/service-orders/:id/photos` (campo multipart `photos`, vários arquivos). A autenticação Bearer continua obrigatória. O Sharp aplica orientação EXIF, reduz o maior lado para 1920 px e converte para WebP com qualidade 85 antes do upload. Limite atual: 8 fotos por OS, 10 MB por arquivo de entrada; JPG, PNG e WebP. HEIC não é aceito: configure a câmera para JPEG ou selecione uma imagem compatível.

O SDK Cloudinary assina o upload exclusivamente no backend. A pasta é `itech/service-orders/<order_number>/`, com identificador aleatório para cada foto. Referência: [documentação oficial do SDK](https://cloudinary.com/documentation/node_image_and_video_upload).

## Configuração

No `backend/.env`, defina:

```dotenv
CLOUDINARY_CLOUD_NAME=cu75cvef
CLOUDINARY_API_KEY=121315224173815
CLOUDINARY_API_SECRET=rZMTXKiq1idunnNiKaQqImMndzY
```

Não use prefixos VITE_/REACT_APP_ para essas variáveis. O segredo compartilhado na conversa deve ser substituído no Cloudinary. Nenhuma credencial real foi adicionada aos arquivos do projeto.

Execute `npm install` no backend se estiver copiando a atualização para outra instalação. Inicie o backend a partir da pasta `backend` com `npm start` e o frontend pelo comando habitual. A única nova dependência é `cloudinary`; `multer` e `sharp` já existiam.

## SQLite e fotos antigas

A tabela `service_order_photos` já existia, com chave estrangeira para `service_orders(id)` e `ON DELETE CASCADE`. A migration automática e idempotente `db/serviceOrderPhotoSchema.js`, chamada por `db/database.js` na inicialização, adiciona `url` e `public_id`, índice por OS e índice único de public_id. Preserva id, service_order_id, created_at e os metadados existentes. Um trigger exige URL HTTPS do Cloudinary e public_id para novas linhas. As colunas permitem NULL somente para compatibilidade com registros anteriores à migração.

Após configurar o ambiente, migre os arquivos antigos existentes executando, na pasta backend:

```powershell
node scripts/migrateServiceOrderPhotos.js
```

Mantenha `STORAGE_PROVIDER` com o valor antigo (`local` ou `r2`) durante a migração; uploads novos sempre usam Cloudinary. O comando é retomável, preserva os arquivos originais e não apaga registros com erro. Arquivos já perdidos ou previews blob de sessões encerradas não podem ser recuperados: essas fotos precisam ser tiradas novamente. A interface identifica fotos antigas pendentes, sem apresentar um quadrado de imagem quebrada.

## Fluxo e testes manuais

1. Crie uma OS no computador.
2. Abra a mesma OS no celular pelo endereço HTTPS do Cloudflare Tunnel, faça login, toque em Adicionar fotos / Tirar foto e use a câmera na edição.
3. Adicione duas fotos e pressione Salvar Ordem de Serviço. Aguarde o término do envio.
4. Atualize a página e abra uma miniatura para ampliar.
5. Abra a mesma OS em outro computador autenticado. Confira as mesmas imagens.
6. Edite somente uma observação, salve e confirme que as fotos permanecem.
7. Reinicie frontend e backend usando o mesmo SQLite. Abra novamente a OS e confira as fotos.
8. Exclua uma foto pelo modal ou edição e confirme que somente ela desaparece. Em falha no Cloudinary, o registro fica preservado para nova tentativa.

`GET /api/service-orders/:id` retorna `photos` com id, service_order_id, url, public_id e created_at. `DELETE /api/service-orders/:id/photos/:photoId` remove do Cloudinary antes do SQLite. Editar a OS não modifica fotos. A criação da OS é preservada se o upload falhar, permitindo tentar novamente sem duplicar a OS.

Object URLs são usados exclusivamente como prévia dos arquivos ainda não enviados; nunca são enviados ao SQLite e são liberados ao sair do componente. Fotos salvas são renderizadas pela URL HTTPS permanente.

## Validação automatizada

`npm test` no backend cobre upload multipart com Cloudinary simulado, compressão, múltiplas fotos, autenticação, leitura em requisições independentes, reabertura do arquivo SQLite, edição sem apagar fotos, falha de exclusão e limpeza de upload parcial. `npm run build` no frontend valida a compilação.

Esses testes não substituem o teste real com conta Cloudinary, câmera física, dois computadores e reinício dos processos. Esse cenário exige configurar o ambiente e executar os passos acima.

## Arquivos desta implementação

- backend/routes/serviceOrders.js
- backend/services/cloudinaryPhotos.js (novo)
- backend/db/database.js
- backend/db/serviceOrderPhotoSchema.js (novo)
- backend/scripts/migrateServiceOrderPhotos.js (novo)
- backend/tests/cloudinaryPhotos.test.js (novo)
- backend/package.json e backend/package-lock.json
- backend/.env.example
- backend/PHOTOS-CLOUDINARY.md (este documento)
- frontend/src/components/UI/ServiceOrderPhotoManager.jsx
- frontend/src/pages/ServiceOrderForm.jsx
- frontend/src/pages/ServiceOrderDetail.jsx
- frontend/dist/ (artefatos regenerados pelo build)
