# Ágata ERP Web

Interface web do Ágata ERP para as empresas e respetivas equipas. O backoffice da plataforma Nobug Labs é um projeto separado, em [`../agatha-admin`](../agatha-admin/README.md).

## Executar localmente

1. Copie `.env.example` para `.env.local`; por omissão, a interface usa a API de teste em `http://102.37.1.46:8083`.
2. Para usar uma API local, defina `VITE_AGATHA_API_BASE_URL=http://localhost:8080/api/v1`; o Vite encaminha `/api` e `/media` para essa API.
3. Instale dependências e inicie o frontend:

```powershell
npm install
npm run dev
```

O frontend abre em `http://localhost:3002`, sem partilhar a porta dos outros portais.

## Incluído nesta primeira versão

- Login, renovação de sessão e registo inicial de empresa.
- Atribuição opcional de referências Nobug Rewards recebidas no parâmetro `?ref=CODE`.
- Contexto da empresa, estado do onboarding, edição de perfil e envio dos documentos exigidos pela API.
- Escolha de plano após aprovação.
- Layout responsivo, sem fontes ou imagens externas.

## Primeira etapa operacional

- Painel com resumo de vendas, artigos, clientes e alertas de stock.
- Catálogo: criar produtos/serviços, preços, impostos, stock inicial e imagem.
- Clientes: criar e pesquisar contactos com dados fiscais e prazos de pagamento. Empresas usam NIF de 10 dígitos; pessoas singulares usam o formato de identificação fiscal associado ao BI, como `82001819LA023`.
- Inventário: consultar posição, movimentos e registar entradas ou ajustes.
- Ponto de venda: selecionar artigos e cliente, cobrar por diferentes métodos ou registar venda a crédito. A API calcula os valores finais e movimenta o stock atomicamente.
- Faturas: escolher cliente e artigos, emitir a fatura numa só ação (o stock controlado é atualizado na emissão) e descarregar o PDF. Se a emissão falhar após guardar, o rascunho fica disponível para nova tentativa.

Compras e verticais serão integrados nas próximas etapas. A informação e as ações apresentadas respeitam o estado, os módulos e as permissões devolvidas pela API.

Para produção, use um URL HTTPS e permita no `CORS_ORIGINS` da API a origem pública do frontend. A URL HTTP do VPS está configurada apenas para testes.

Para usar links de indicação, configure `REWARDS_API_BASE_URL` e
`REWARDS_INTERNAL_EVENT_SECRET` na API Agatha. Na API Rewards, configure
`REFERRAL_REDIRECT_URL` com a origem pública do Agatha e o parâmetro
`?ref={code}`. O código é mantido pelo formulário de registo; o navegador nunca
recebe o segredo HMAC.
