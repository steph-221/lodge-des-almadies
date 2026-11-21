# Comptes et services — Lodge des Almadies

Noms des champs uniquement : les valeurs vont dans `.env` (jamais suivi par git) et dans le coffre.

| Service | Rôle | Adresse de connexion | Champs | État |
|---|---|---|---|---|
| Administration du site | Accès de secours de la direction | https://lodge-des-almadies.vercel.app/admin/ | `ADMIN_PASSWORD` (16 caractères minimum), `SESSION_SECRET` | existe (corrigé en production le 17/11) |
| Comptes du personnel | Connexion par rôle à l'espace Services hôtel | https://lodge-des-almadies.vercel.app/admin/ | `STAFF_PEPPER` (codes hachés en base) | à créer |
| Neon (Postgres) | Base de l'espace Services hôtel (projet dédié au Lodge) | https://console.neon.tech | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | existe (projet `lodge-des-almadies`, id quiet-haze-05424490, Francfort ; branche `main` = production, branche `dev` = tests locaux ; variables Vercel présentes en Production et Preview) |
| Vercel Cron | Brief quotidien et sauvegarde (lot 2) | https://vercel.com | `CRON_SECRET` | existe (défini en Production) |
| Vercel Blob | Photos et contenu du site public | https://vercel.com | `BLOB_READ_WRITE_TOKEN` | à vérifier |
| Cloudflare Turnstile | Anti-robot du formulaire de contact | https://dash.cloudflare.com | `PUBLIC_TURNSTILE_SITEKEY`, `TURNSTILE_SECRET` | à vérifier |
| Resend | Envoi des e-mails (contact, brief, alertes) | https://resend.com | `RESEND_API_KEY`, `CONTACT_FROM` | à créer |
| Google Drive (compte Google de l'hôtel) | Photos de visites, fichiers importés, sauvegardes (lot 1c) | https://drive.google.com | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` | à créer |
| Anthropic API | Lecture des fiches papier (lot 5) | https://console.anthropic.com | `ANTHROPIC_API_KEY` | à créer |
| Octorate | Moteur de réservation (lien réglé dans l'admin) | — | aucun champ secret dans le code | à vérifier |
