FROM python:3.11-alpine

WORKDIR /app

# psycopg2-binary já tem libpq embutida, sem precisar de postgresql-dev
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY templates/ templates/
COPY static/ static/

# Railway/Coolify injetam PORT automaticamente
ENV HOST=0.0.0.0
EXPOSE 8000

# Postgres via socket Unix dentro do Coolify container; ajuste PORTARIA_DSN se for usar TCP externo
ENV PORTARIA_DSN="host=p236y4fw7va4180f8yqd3o7u port=5432 dbname=portaria user=portaria password=_nDiIGt3Y4lS9m40RUrePLkWNmA"

# Token de leitura da lista. Coolify permite definir PORTARIA_LIST_TOKEN via env var na UI.
ENV PORTARIA_LIST_TOKEN="beb4afa4039a9ea01e08835b6184eed7"

CMD ["python", "server.py"]