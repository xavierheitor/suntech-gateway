# Suntech Gateway

Gateway de laboratório para rastreadores Suntech ST8310:

- servidor TCP para receber conexões e mensagens do rastreador;
- API HTTP para listar conexões/mensagens e enviar comandos;
- **Console TCP** web com histórico e envio manual em tempo real (WebSocket);
- persistência SQLite (`TcpConnection` + `TcpMessage`) para auditoria.

> Esta versão é deliberadamente simples. Não use o endpoint de comandos em produção sem autenticação, autorização e controles de acesso.

## Arquitetura

O projeto usa Express (não NestJS), organizado em camadas equivalentes:

| Camada | Pasta / classe |
|--------|----------------|
| Gateway TCP | `src/tcp/tcp-server.ts` — abre/fecha, framing, encaminha |
| ConnectionManager | `src/connection/connection.manager.ts` — sockets vivos + envio |
| Service / Controller | `src/connection/*` |
| Repository | `src/persistence/*` (SQLite via `node:sqlite`) |
| EventBus + WebSocket | `src/common/event-bus.ts`, `src/realtime/ws.gateway.ts` |
| UI | `public/console.html` |

## 1. Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

Portas padrão (`.env.example`):

- TCP Suntech: `7777`
- HTTP API + Console: `7771`

Abra o console: http://localhost:7771/console

## 2. Testar sem o rastreador

Terminal 1:

```bash
npm run dev
```

Terminal 2, simulando o Suntech:

```bash
nc 127.0.0.1 7777
STT;1610009909;B9FFFF;201;1.1.11;0;20260727;20:00:00
```

Em outro terminal:

```bash
curl http://localhost:7771/connections
curl http://localhost:7771/messages
```

Envio bruto pelo Console API (sem alterar o texto):

```bash
curl -X POST http://localhost:7771/connections/<ID>/send \
  -H 'Content-Type: application/json' \
  -d '{"text":"CMD;1610009909;03;01","appendTerminator":true}'
```

Envio legado (monta `CMD;ID;...` e acrescenta terminador):

```bash
curl -X POST http://localhost:7771/devices/1610009909/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"03;01"}'
```

## 3. Endpoints

### Existentes

- `GET /health`
- `GET /connections`
- `GET /messages?deviceId=...&direction=IN&kind=STT&limit=100`
- `POST /devices/:deviceId/commands`
- `POST /connections/:connectionId/commands`

### Console TCP

- `GET /connections/:id` — detalhes
- `GET /connections/:id/history` — histórico persistido
- `POST /connections/:id/send` — `{ "text": "...", "appendTerminator": false }`
- `POST /connections/:id/disconnect` — fecha o socket ativo
- `WS /ws` — eventos em tempo real:
  - `connection.created`
  - `connection.closed`
  - `connection.updated`
  - `message.received`
  - `message.sent`

`POST /send` escreve **exatamente** o conteúdo de `text` no socket já aberto pelo rastreador. Use `"appendTerminator": true` apenas se quiser acrescentar o `COMMAND_TERMINATOR` do `.env`.

## 4. Configuração do rastreador

```text
Servidor principal: IP público ou DNS da VPS
Porta principal: 7777
Protocolo principal: TCP (00)
Tipo de conexão: sempre conectado (00)
ZIP: desabilitado (00), inicialmente
AES128: desabilitado (00), inicialmente
```

## 5. Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

O volume `gateway-data` persiste o SQLite em `/app/data`.

## 6. Observações sobre enquadramento TCP

TCP não preserva mensagens: uma mensagem pode chegar fragmentada ou várias podem chegar juntas. O gateway:

1. separa mensagens por CRLF, LF ou CR;
2. se não encontrar terminador, processa o buffer após 300 ms sem novos bytes.

Caso o equipamento use outro terminador, ajuste `COMMAND_TERMINATOR` e `SOCKET_IDLE_FLUSH_MS` no `.env`.
