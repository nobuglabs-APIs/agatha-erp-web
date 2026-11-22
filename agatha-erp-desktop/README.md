# Ágata ERP Desktop

Shell desktop do Ágata ERP, separado do portal administrativo e integrado ao
repositório web para reutilizar a interface e os verticais.

## Tecnologia

- Tauri 2
- Interface compartilhada com a raiz deste repositório
- Rust para integrações locais e sincronização futura
- Cache e fila local inicial com IndexedDB do WebView

## Pré-requisitos

- Node.js e npm
- Rust 1.80+
- Dependências nativas do Tauri para o sistema operativo

## Desenvolvimento

```bash
npm install
npm run tauri:dev
```

O comando inicia o Vite na porta 3002 e abre a interface na janela Tauri. O
modo desktop usa `.env.desktop` e aponta para `http://localhost:8080/api/v1`.
Inicie a API local antes de testar as operações; este endpoint HTTP é apenas
para desenvolvimento e não deve ser usado numa distribuição de produção.

## Build

```bash
npm run tauri:build
```

O build do ERP web é executado antes do empacotamento desktop e também aponta
para `http://localhost:8080/api/v1` para permitir testes locais.

Para produção, configure uma API HTTPS e CORS para a origem do aplicativo antes
de gerar os instaladores.

## Estado offline

A primeira fase guarda respostas GET por empresa e permite registar vendas POS
como pendentes durante uma quebra de ligação. Ao voltar a ficar online, a venda
é enviada à API com a mesma chave idempotente; só a API confirma o stock e emite
o documento fiscal. Valores apresentados enquanto pendente são uma prévia.

Esta fase exige que a sessão tenha sido iniciada online. Outras operações de
escrita e o início de sessão sem rede ainda não estão disponíveis offline.

## Estrutura

```text
agatha-erp-desktop/
  package.json
  src-tauri/
    Cargo.toml
    build.rs
    tauri.conf.json
    src/main.rs
```
