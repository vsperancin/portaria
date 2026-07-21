# Portaria VinIA — cadastro de entrada

Formulário animado de cadastro pra controle de portaria (nome / telefone / cpf).
Roda local na VINIA, persiste em Postgres, expõe lista em `/lista?token=...`.

## Rodar

```bash
cd ~/projects/portaria
.venv/bin/python server.py
# ou via systemd-user:
systemctl --user status portaria
```

## Variáveis

- `HOST` (default `0.0.0.0`)
- `PORT` (default `8103`)
- `PORTARIA_DSN` (default `host=127.0.0.1 port=5432 dbname=portaria user=vinicius`)
- `PORTARIA_LIST_TOKEN` — token pra `/lista` (gera um novo em produção com `openssl rand -hex 16`)

## Endpoints

- `GET /` — formulário
- `GET /sucesso` — confirmação
- `POST /api/cadastrar` — JSON `{nome, telefone, cpf}`
- `GET /api/count` — total
- `GET /lista?token=<TOKEN>` — JSON com todos
- `GET /health`

## Validação

- Nome ≥ 3 chars e ≥ 2 palavras
- Telefone BR 10 ou 11 dígitos (DDD 11-99, 9° dígito se celular)
- CPF 11 dígitos com dígitos verificadores válidos
- Hash SHA-256 do CPF pra dedupe (`cpf_hash` UNIQUE)

## Persistência

Postgres local, banco `portaria`, tabela `cadastros(id, nome, telefone, cpf, cpf_hash UNIQUE, created_at)`.