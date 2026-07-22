FROM python:3.11-alpine

WORKDIR /app

# psycopg2-binary já tem libpq embutida, sem precisar de postgresql-dev
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY templates/ templates/
COPY static/ static/

# Configurações fixas (não-secretas) vão direto no Dockerfile
ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000

# Token de leitura da lista (não é senha de banco, é token de auth de leitura)
ENV PORTARIA_LIST_TOKEN="beb4afa4039a9ea01e08835b6184eed7"

# DATABASE_KEY (DSN do Postgres) vem EXCLUSIVAMENTE via env var do Coolify
# Formato: postgres://user:password@host:port/dbname
# É sensitive — Coolify deve marcar como secret
# server.py lê de os.environ["DATABASE_KEY"]

CMD ["python", "server.py"]