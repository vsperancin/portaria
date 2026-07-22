FROM python:3.11-alpine

WORKDIR /app

# psycopg2-binary já tem libpq embutida, sem precisar de postgresql-dev
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY templates/ templates/
COPY static/ static/

# Railway/Coolify injetam PORT automaticamente — padrão Vinicius = 5000
ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000

# Postgres via TCP no mesmo Docker network do Coolify (hostname do container)
# Se PORTARIA_DSN não vier via env Coolify, usa o internal_db_url (apps no mesmo VPS)
ENV PORTARIA_DSN="host=ul9j6y2g4istu4dmzql1c2g2 port=5432 dbname=portaria user=portaria password=gcjrG-J_C5et7nHiP-NWh-5B0VE"

# Token de leitura da lista. Coolify permite definir PORTARIA_LIST_TOKEN via env var na UI.
ENV PORTARIA_LIST_TOKEN="beb4afa4039a9ea01e08835b6184eed7"

CMD ["python", "server.py"]