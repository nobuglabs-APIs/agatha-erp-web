# Ágata ERP Desktop

Shell desktop do Ágata ERP, separado do portal administrativo e integrado ao
repositório web para reutilizar a interface e os verticais.

## Tecnologia

- Tauri 2
- Interface compartilhada com a raiz deste repositório
- Rust para integrações locais e sincronização futura
- SQLite local será integrado em uma etapa posterior

## Pré-requisitos

- Node.js e npm
- Rust 1.80+
- Dependências nativas do Tauri para o sistema operativo

## Desenvolvimento

```bash
npm install
npm run tauri:dev
```

O comando inicia o servidor Vite do ERP web na porta 3002 e abre a interface
na janela Tauri.

## Build

```bash
npm run tauri:build
```

O build do ERP web é executado antes do empacotamento desktop.

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
