# Suntech Gateway

Gateway de laboratório para rastreadores Suntech ST8310:

- servidor TCP para receber conexões e mensagens do rastreador;
- API HTTP para listar conexões/mensagens e enviar comandos;
- histórico em memória para depuração inicial.

> Esta primeira versão é deliberadamente simples. Não use o endpoint de comandos em produção sem autenticação, autorização, persistência e auditoria.

## 1. Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

Portas padrão:

- TCP Suntech: `7777`
- HTTP API: `3000`

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
curl http://localhost:3000/connections
curl http://localhost:3000/messages
```

Enviar pedido de posição:

```bash
curl -X POST http://localhost:3000/devices/1610009909/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"03;01"}'
```

O gateway enviará:

```text
CMD;1610009909;03;01\r\n
```

Outros testes úteis:

```bash
# Versão da aplicação
curl -X POST http://localhost:3000/devices/1610009909/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"03;04;1"}'

# Ler parâmetros de rede
curl -X POST http://localhost:3000/devices/1610009909/commands \
  -H 'Content-Type: application/json' \
  -d '{"command":"03;06;0"}'
```

## 3. Configuração do rastreador

Configure no Suntech:

```text
Servidor principal: IP público ou DNS da VPS
Porta principal: 7777
Protocolo principal: TCP (00)
Tipo de conexão: sempre conectado (00)
ZIP: desabilitado (00), inicialmente
AES128: desabilitado (00), inicialmente
```

Exemplos de programação documentados:

```text
PRG;ID;10;05#SEU_DNS_OU_IP
PRG;ID;10;06#7777
PRG;ID;10;07#00
PRG;ID;10;13#0
PRG;ID;10;55#00
PRG;ID;10;72#00
```

Substitua `ID` pelo ID real do equipamento.

## 4. Publicação em VPS

Libere somente o necessário no firewall:

```bash
sudo ufw allow 7777/tcp
sudo ufw allow 3000/tcp
```

Para laboratório:

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

Em produção, não exponha a porta HTTP 3000 diretamente. Coloque-a atrás do Nginx com HTTPS e autenticação. A porta TCP 7777 precisa continuar acessível ao chip do rastreador.

## 5. Endpoints

- `GET /health`
- `GET /connections`
- `GET /messages?deviceId=...&direction=IN&kind=STT&limit=100`
- `POST /devices/:deviceId/commands`
- `POST /connections/:connectionId/commands`

Corpo do comando:

```json
{ "command": "03;01" }
```

Também aceita a string completa:

```json
{ "command": "CMD;1610009909;03;01" }
```

## 6. Observações sobre enquadramento TCP

TCP não preserva mensagens: uma mensagem pode chegar fragmentada ou várias podem chegar juntas. O gateway:

1. separa mensagens por CRLF, LF ou CR;
2. se não encontrar terminador, processa o buffer após 300 ms sem novos bytes.

Caso o equipamento use outro terminador, ajuste `COMMAND_TERMINATOR` e `SOCKET_IDLE_FLUSH_MS` no `.env` depois de observar o tráfego real.
