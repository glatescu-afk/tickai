# Service agent Tick.AI (service_api.py) — déployé sur Railway.
# En served desktop, ce conteneur n'a PAS d'écran : il appelle H Company à
# distance et pilote le bridge de la machine cible via son session_id. Il n'a
# donc besoin que du SDK de base (pas des extras desktop/browser).
FROM python:3.12-slim

WORKDIR /app

# Dépendances d'abord (cache de build).
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Seulement ce dont le service a besoin (ni portail, ni data, ni tests).
COPY service_api.py agent_teams.py ./
COPY tickai_core ./tickai_core

# Journal local (audit) — éphémère sur Railway ; le vrai journal va dans Supabase via n8n.
RUN mkdir -p /app/logs

# Montage produit par défaut (pilotage à distance d'une machine cible).
ENV HAI_SERVED_DESKTOP=1

# Railway fournit $PORT ; défaut 8000 en local.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn service_api:app --host 0.0.0.0 --port ${PORT:-8000}"]
